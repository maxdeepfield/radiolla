const { spawnSync } = require('child_process');
const path = require('path');

function runGradle(tasks) {
  const androidDir = path.join(__dirname, '..', 'android');
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'cmd.exe' : './gradlew';
  const args = isWindows ? ['/d', '/c', 'gradlew.bat', ...tasks] : tasks;

  const result = spawnSync(command, args, {
    cwd: androidDir,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

if (require.main === module) {
  const tasks = process.argv.slice(2);

  if (tasks.length === 0) {
    console.error('Usage: node scripts/android-gradle.js <gradle-task> [...]');
    process.exit(1);
  }

  process.exit(runGradle(tasks));
}

module.exports = { runGradle };
