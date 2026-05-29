package com.absolutefreakout.radiolla

import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class BluetoothAutoPlayModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var receiverRegistered = false
  private var audioDeviceCallback: AudioDeviceCallback? = null

  private val bluetoothReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          val action = intent?.action ?: return
          when (action) {
            BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED,
            BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED -> {
              if (intent.getIntExtra(BluetoothProfile.EXTRA_STATE, -1) ==
                  BluetoothProfile.STATE_CONNECTED) {
                emitConnectedOrRetry("bluetooth-profile")
              }
            }
            BluetoothDevice.ACTION_ACL_CONNECTED -> emitConnectedOrRetry("bluetooth-acl")
          }
        }
      }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    registerListeners()
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    try {
      registerListeners()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_BLUETOOTH_AUTOPLAY_START", error)
    }
  }

  @ReactMethod
  fun isBluetoothAudioConnected(promise: Promise) {
    try {
      promise.resolve(isBluetoothAudioOutputConnected())
    } catch (error: Exception) {
      promise.reject("ERR_BLUETOOTH_AUDIO_STATE", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }

  override fun invalidate() {
    unregisterListeners()
    super.invalidate()
  }

  private fun registerListeners() {
    registerBluetoothReceiver()
    registerAudioDeviceCallback()
  }

  private fun registerBluetoothReceiver() {
    if (receiverRegistered) return

    val filter =
        IntentFilter().apply {
          addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
          addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
          addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
        }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      reactContext.registerReceiver(bluetoothReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun registerAudioDeviceCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || audioDeviceCallback != null) return

    val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val callback =
        object : AudioDeviceCallback() {
          override fun onAudioDevicesAdded(addedDevices: Array<AudioDeviceInfo>) {
            if (addedDevices.any { isBluetoothAudioDevice(it) }) {
              emitConnected("audio-device")
            }
          }
        }

    audioManager.registerAudioDeviceCallback(callback, null)
    audioDeviceCallback = callback
  }

  private fun unregisterListeners() {
    if (receiverRegistered) {
      try {
        reactContext.unregisterReceiver(bluetoothReceiver)
      } catch (_: IllegalArgumentException) {
        // Receiver was already unregistered.
      }
      receiverRegistered = false
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      audioDeviceCallback?.let { callback ->
        val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.unregisterAudioDeviceCallback(callback)
      }
    }
    audioDeviceCallback = null
  }

  private fun emitConnectedOrRetry(source: String) {
    if (isBluetoothAudioOutputConnected()) {
      emitConnected(source)
      return
    }

    mainHandler.postDelayed(
        {
          if (isBluetoothAudioOutputConnected()) {
            emitConnected(source)
          }
        },
        AUDIO_ROUTE_SETTLE_DELAY_MS)
  }

  private fun emitConnected(source: String) {
    val params =
        Arguments.createMap().apply {
          putString("source", source)
        }

    try {
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_BLUETOOTH_AUDIO_CONNECTED, params)
    } catch (_: RuntimeException) {
      // JS may not be ready yet; media-session RemotePlay handles that path.
    }
  }

  private fun isBluetoothAudioOutputConnected(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false

    val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return audioManager
        .getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        .any { isBluetoothAudioDevice(it) }
  }

  private fun isBluetoothAudioDevice(device: AudioDeviceInfo): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false

    val type = device.type
    if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
      return true
    }

    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        (type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
            type == AudioDeviceInfo.TYPE_BLE_SPEAKER)
  }

  companion object {
    const val NAME = "BluetoothAutoPlay"
    const val EVENT_BLUETOOTH_AUDIO_CONNECTED = "RadiollaBluetoothAudioConnected"
    private const val AUDIO_ROUTE_SETTLE_DELAY_MS = 1500L
  }
}
