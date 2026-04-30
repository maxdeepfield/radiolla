const { runGradle } = require('./android-gradle');

function stopGradle() {
  const status = runGradle(['--stop']);

  if (status !== 0) {
    console.warn('Gradle daemon stop returned a non-zero status. Continuing with clean...');
  }
}

function cleanAndroid() {
  stopGradle();

  let status = runGradle(['clean']);
  if (status === 0) {
    return 0;
  }

  console.warn('Gradle clean failed. Retrying once after stopping daemons again...');
  stopGradle();

  status = runGradle(['clean']);
  return status;
}

if (require.main === module) {
  process.exit(cleanAndroid());
}

module.exports = { cleanAndroid };
