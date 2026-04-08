const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SUPPORTED_FLAVORS = new Set(['user', 'listener']);
const SUPPORTED_MODES = new Set(['apk', 'bundle']);

const parseEnvFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return acc;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return acc;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquotedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    acc[key] = unquotedValue;
    return acc;
  }, {});
};

const run = async () => {
  const flavor = String(process.argv[2] || '').trim().toLowerCase();
  const mode = String(process.argv[3] || 'apk').trim().toLowerCase();

  if (!SUPPORTED_FLAVORS.has(flavor)) {
    console.error('Usage: node scripts/build-android-flavor.js <user|listener> [apk|bundle]');
    process.exit(1);
  }

  if (!SUPPORTED_MODES.has(mode)) {
    console.error('Usage: node scripts/build-android-flavor.js <user|listener> [apk|bundle]');
    process.exit(1);
  }

  const repoRoot = path.resolve(__dirname, '..');
  const androidDir = path.join(repoRoot, 'android');
  const envFilePath = path.join(repoRoot, `.env.${flavor}`);

  if (!fs.existsSync(envFilePath)) {
    console.error(`Missing environment file: ${envFilePath}`);
    process.exit(1);
  }

  const releaseVariantName = `${flavor}Release`;
  const gradleTask =
    mode === 'bundle'
      ? `createBundle${flavor === 'listener' ? 'Listener' : 'User'}ReleaseJsAndAssets`
      : `assemble${flavor === 'listener' ? 'Listener' : 'User'}Release`;
  const outputPath =
    mode === 'bundle'
      ? path.join(
          androidDir,
          'app',
          'build',
          'generated',
          'assets',
          'react',
          releaseVariantName,
          'index.android.bundle',
        )
      : path.join(
          androidDir,
          'app',
          'build',
          'outputs',
          'apk',
          flavor,
          'release',
          `clarivoice-${flavor}.apk`,
        );
  const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const envFromFile = parseEnvFile(envFilePath);

  const command = process.platform === 'win32' ? 'cmd.exe' : gradleCommand;
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', gradleCommand, gradleTask]
      : [gradleTask];

  const child = spawn(command, args, {
    cwd: androidDir,
    env: {
      ...process.env,
      ...envFromFile,
      NODE_ENV: 'production',
      BABEL_ENV: 'production',
      CLARIVOICE_BUILD_FLAVOR: flavor,
      EXPO_PUBLIC_APP_FLAVOR: flavor,
      EXPO_PUBLIC_APP_MODE: flavor,
    },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      process.exit(code || 1);
    }

    console.log('');
    console.log(`${mode === 'bundle' ? 'Bundle' : 'Build'} complete: ${outputPath}`);
  });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
