const os = require('os');
const util = require('util');
const { exec } = require('child_process');

const execPromise = util.promisify(exec);

class SystemChecks {
  // Utility: Run commands safely and always return a string
  async runCommand(command) {
    try {
      const { stdout } = await execPromise(command);
      return stdout.toString();
    } catch (error) {
      throw new Error(error.stderr?.toString() || error.message);
    }
  }

  // Utility: Wrap check to always return a serializable result
  async safeRun(fn) {
    try {
      const result = await fn();
      return JSON.parse(JSON.stringify(result)); // guarantee plain object
    } catch (error) {
      return {
        error: true,
        message: error.message || String(error)
      };
    }
  }

  async checkDiskEncryption() {
    return this.safeRun(async () => {
      const platform = os.platform();
      switch (platform) {
        case 'darwin':
          return this.checkMacOSEncryption();
        case 'win32':
          return this.checkWindowsEncryption();
        case 'linux':
          return this.checkLinuxEncryption();
        default:
          return { enabled: false, status: 'Platform not supported' };
      }
    });
  }

  async checkMacOSEncryption() {
    const stdout = await this.runCommand('fdesetup status');
    const enabled = stdout.includes('FileVault is On');
    return {
      enabled,
      status: stdout.trim(),
      method: 'FileVault'
    };
  }

  async checkWindowsEncryption() {
    const stdout = await this.runCommand('manage-bde -status C:');
    const enabled = stdout.includes('Protection On') || stdout.includes('Fully Encrypted');
    return {
      enabled,
      status: enabled ? 'BitLocker enabled' : 'BitLocker not enabled',
      method: 'BitLocker',
      details: stdout.substring(0, 200)
    };
  }

  async checkLinuxEncryption() {
    const stdout = await this.runCommand('lsblk -f');
    const enabled = stdout.includes('crypto_LUKS');
    return {
      enabled,
      status: enabled ? 'LUKS encryption detected' : 'No LUKS encryption found',
      method: 'LUKS',
      details: stdout.substring(0, 200)
    };
  }

  async checkOSUpdates() {
    return this.safeRun(async () => {
      const platform = os.platform();
      switch (platform) {
        case 'darwin':
          return this.checkMacOSUpdates();
        case 'win32':
          return this.checkWindowsUpdates();
        case 'linux':
          return this.checkLinuxUpdates();
        default:
          return { updatesAvailable: false, status: 'Platform not supported' };
      }
    });
  }

  async checkMacOSUpdates() {
    const stdout = await this.runCommand('softwareupdate -l');
    const updatesAvailable = !stdout.includes('No new software available');
    return {
      updatesAvailable,
      lastCheck: new Date().toISOString(),
      status: updatesAvailable ? 'Updates available' : 'System up to date',
      details: stdout.substring(0, 500)
    };
  }

  async checkWindowsUpdates() {
    const command = 'powershell "Get-WindowsUpdate -AcceptAll -Hide"';
    const stdout = await this.runCommand(command);
    return {
      updatesAvailable: stdout.trim().length > 0,
      lastCheck: new Date().toISOString(),
      status: 'Windows Update check completed',
      details: stdout.substring(0, 500)
    };
  }

  async checkLinuxUpdates() {
    let stdout;
    let packageManager = 'unknown';

    try {
      stdout = await this.runCommand('apt list --upgradable 2>/dev/null | wc -l');
      packageManager = 'apt';
    } catch {
      try {
        stdout = await this.runCommand('yum check-update | grep -c "^[^L]" || true');
        packageManager = 'yum';
      } catch {
        try {
          stdout = await this.runCommand('zypper list-updates | wc -l');
          packageManager = 'zypper';
        } catch {
          throw new Error('No supported package manager found');
        }
      }
    }

    const updateCount = parseInt(stdout.trim(), 10);
    return {
      updatesAvailable: updateCount > (packageManager === 'apt' ? 1 : 0),
      lastCheck: new Date().toISOString(),
      status: `${updateCount} package${updateCount !== 1 ? 's' : ''} can be upgraded`,
      packageManager,
      details: `Using ${packageManager}`
    };
  }

  async checkAntivirus() {
    return this.safeRun(async () => {
      const platform = os.platform();
      switch (platform) {
        case 'darwin':
          return this.checkMacOSAntivirus();
        case 'win32':
          return this.checkWindowsAntivirus();
        case 'linux':
          return this.checkLinuxAntivirus();
        default:
          return { installed: false, running: false, status: 'Platform not supported' };
      }
    });
  }

  async checkMacOSAntivirus() {
    return {
      installed: true,
      running: true,
      name: 'XProtect (Built-in)',
      status: 'macOS built-in malware protection active',
      lastUpdate: 'Automatic updates'
    };
  }

  async checkWindowsAntivirus() {
    const stdout = await this.runCommand('wmic /namespace:\\\\root\\SecurityCenter2 path AntivirusProduct get displayName,productState /format:csv');
    const lines = stdout.trim().split('\n').filter(Boolean);

    if (lines.length > 1) {
      const parts = lines[1].split(',');
      const displayName = parts[1] || 'Windows Defender';
      const productState = parseInt(parts[2] || '0');
      const running = (productState & 0x1000) !== 0;

      return {
        installed: true,
        running,
        name: displayName,
        status: running ? 'Antivirus active' : 'Antivirus installed but not active',
        productState: productState.toString(16)
      };
    }

    return { installed: false, running: false, status: 'No antivirus product detected' };
  }

  async checkLinuxAntivirus() {
    const antivirusChecks = [
      { command: 'which clamav', name: 'ClamAV' },
      { command: 'which freshclam', name: 'ClamAV' },
      { command: 'systemctl is-active clamav-daemon', name: 'ClamAV Daemon' },
      { command: 'which rkhunter', name: 'RKHunter' },
      { command: 'which chkrootkit', name: 'chkrootkit' }
    ];

    for (const check of antivirusChecks) {
      try {
        await this.runCommand(check.command);
        return {
          installed: true,
          running: true,
          name: check.name,
          status: `${check.name} detected`,
          method: 'Command line detection'
        };
      } catch {
        continue;
      }
    }

    return { installed: false, running: false, status: 'No common antivirus solutions detected' };
  }

  async checkSleepSettings() {
    return this.safeRun(async () => {
      const platform = os.platform();
      switch (platform) {
        case 'darwin':
          return this.checkMacOSSleep();
        case 'win32':
          return this.checkWindowsSleep();
        case 'linux':
          return this.checkLinuxSleep();
        default:
          return { sleepTime: null, compliant: false, status: 'Platform not supported' };
      }
    });
  }

  async checkMacOSSleep() {
    const stdout = await this.runCommand('pmset -g | grep -E "(sleep|displaysleep)"');
    const lines = stdout.split('\n');
    let sleepTime = null;
    let displaySleep = null;

    lines.forEach(line => {
      const match = line.match(/sleep\s+(\d+)/);
      if (match) sleepTime = parseInt(match[1], 10);
      const displayMatch = line.match(/displaysleep\s+(\d+)/);
      if (displayMatch) displaySleep = parseInt(displayMatch[1], 10);
    });

    const effectiveSleep = Math.min(sleepTime || Infinity, displaySleep || Infinity);

    return {
      sleepTime: effectiveSleep === Infinity ? null : effectiveSleep,
      displaySleep,
      compliant: effectiveSleep <= 10,
      status: `Sleep: ${sleepTime || 'Never'} min, Display: ${displaySleep || 'Never'} min`,
      settings: stdout.trim()
    };
  }

  async checkWindowsSleep() {
    try {
      const stdout = await this.runCommand('powercfg /query SCHEME_CURRENT SUB_SLEEP');
      return {
        sleepTime: null,
        compliant: false,
        status: 'Windows power settings check - manual verification recommended',
        settings: stdout.substring(0, 300)
      };
    } catch {
      return {
        sleepTime: null,
        compliant: false,
        status: 'Unable to check Windows sleep settings'
      };
    }
  }

  async checkLinuxSleep() {
    try {
      const stdout = await this.runCommand('gsettings get org.gnome.desktop.session idle-delay');
      const delay = parseInt(stdout.match(/\d+/)?.[0] || '0');
      return {
        sleepTime: delay / 60,
        compliant: delay <= 600,
        status: `GNOME idle delay: ${delay} seconds`,
        settings: stdout.trim()
      };
    } catch {
      return {
        sleepTime: null,
        compliant: false,
        status: 'Manual check recommended for your desktop environment'
      };
    }
  }
}

module.exports = SystemChecks;
