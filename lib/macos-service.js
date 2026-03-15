var fs = require('fs');
var path = require('path');
var os = require('os');
var { execSync } = require('child_process');

var WORKFLOW_NAME = '🎞️ Process with PPRC';
var SERVICES_DIR = path.join(os.homedir(), 'Library', 'Services');
var WORKFLOW_PATH = path.join(SERVICES_DIR, WORKFLOW_NAME + '.workflow');


function generateWorkflow(command) {
  // Uses "Run Shell Script" action (proven to work with Automator Quick Actions).
  // The shell script opens Terminal so the user can see pprc output and progress.
  // We hard-code absolute paths so it works regardless of the user's shell config
  // (Automator doesn't source .zshrc).
  // Use a heredoc for the AppleScript to avoid nested quoting nightmares.
  // The shell expands $f inside the heredoc, then osascript receives clean AppleScript.
  var shellCommand = [
    'for f in "$@"',
    'do',
    'osascript <<APPLESCRIPT',
    'tell application "Terminal"',
    'activate',
    "do script \"" + command + " --dir '$f'\"",
    'end tell',
    'APPLESCRIPT',
    'done',
  ].join('\n');

  // Escape for XML plist embedding
  var xmlCommand = shellCommand
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>${xmlCommand}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/zsh</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>BB0056A9-DCB8-4786-AC93-FCB9CC8A46B5</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>7EEE85CC-CD54-4F3B-A408-464C0948CBF8</string>
				<key>ShowWhenRun</key>
				<false/>
				<key>UUID</key>
				<string>39E737A4-1200-4554-A2C9-724B8FEB900C</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<integer>0</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>0</string>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<false/>
						<key>name</key>
						<string>CheckedForUserDefaultShell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>1</string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>2</string>
					</dict>
					<key>3</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>COMMAND_STRING</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>3</string>
					</dict>
					<key>4</key>
					<dict>
						<key>default value</key>
						<string>/bin/sh</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>4</string>
					</dict>
				</dict>
				<key>conversionLabel</key>
				<integer>0</integer>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>449.000000:253.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject.folder</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<false/>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject.folder</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<false/>
		<key>systemImageName</key>
		<string>NSActionTemplate</string>
		<key>useAutomaticInputType</key>
		<false/>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>`;
}

function install() {
  if (process.platform !== 'darwin') {
    console.error('Error: --install-quick-action is only supported on macOS.');
    process.exit(1);
  }

  // The workflow opens a Terminal window which sources the user's shell profile,
  // so bare "pprc" works — just like when they type it themselves.
  var command = 'pprc';

  console.log('Installing Finder Quick Action: "' + WORKFLOW_NAME + '"');

  // Create Services directory if it doesn't exist
  if (!fs.existsSync(SERVICES_DIR)) {
    fs.mkdirSync(SERVICES_DIR, { recursive: true });
  }

  // Remove existing workflow if present
  if (fs.existsSync(WORKFLOW_PATH)) {
    fs.rmSync(WORKFLOW_PATH, { recursive: true });
    console.log('  Replaced existing workflow.');
  }

  // Create workflow bundle
  var contentsDir = path.join(WORKFLOW_PATH, 'Contents');
  fs.mkdirSync(contentsDir, { recursive: true });

  var wflow = generateWorkflow(command);
  fs.writeFileSync(path.join(contentsDir, 'document.wflow'), wflow);

  // Info.plist registers the workflow with macOS Services/Quick Actions.
  // NSSendFileTypes declares which UTIs the action accepts in Finder context menus.
  var infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>NSActionTemplate</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>${WORKFLOW_NAME}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.folder</string>
			</array>
		</dict>
	</array>
</dict>
</plist>`;
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlist);

  console.log('\nInstalled to: ' + WORKFLOW_PATH);
  console.log('\nYou can now right-click any folder in Finder and select:');
  console.log('  Quick Actions > ' + WORKFLOW_NAME);

  // Detect macOS version to show the correct settings path for enabling the extension
  var extensionsPath = 'System Settings > Privacy & Security > Extensions > Finder';
  try {
    var swVers = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
    var major = parseInt(swVers.split('.')[0], 10);
    if (major >= 15) {
      extensionsPath = 'System Settings > General > Login Items & Extensions > Extensions > Finder';
    } else if (major >= 13) {
      extensionsPath = 'System Settings > Privacy & Security > Extensions > Finder';
    } else {
      extensionsPath = 'System Preferences > Extensions > Finder';
    }
  } catch (e) {}

  console.log('\nIf the action doesn\'t appear in the right-click menu:');
  console.log('  1. Open ' + extensionsPath);
  console.log('  2. Enable "' + WORKFLOW_NAME + '"');
  console.log('\nOn first use, macOS may ask permission to control Terminal — click Allow.');
}

function uninstall() {
  if (process.platform !== 'darwin') {
    console.error('Error: --uninstall-quick-action is only supported on macOS.');
    process.exit(1);
  }

  if (fs.existsSync(WORKFLOW_PATH)) {
    fs.rmSync(WORKFLOW_PATH, { recursive: true });
    console.log('Removed Finder Quick Action: "' + WORKFLOW_NAME + '"');
  } else {
    console.log('Quick Action not found — nothing to remove.');
  }
}

module.exports = { install, uninstall };
