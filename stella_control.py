import paramiko
import sys
import time
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HOST = '192.168.1.10'
USER = 'zocanw'
PASS = '330757871'

def run(cmd):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=10)
    stdin, stdout, stderr = client.exec_command(
        'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && ' + cmd
    )
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace').strip()
    client.close()
    return out, err

def status():
    out, err = run('pm2 status')
    print(out)
    if err:
        print('STDERR:', err[:300])

def start():
    print('Starting Stella bots...')
    out, err = run('pm2 start stella && pm2 start stella-discord')
    print(out)
    if err:
        print('ERR:', err[:300])
    time.sleep(1)
    status()

def stop():
    print('Stopping Stella bots...')
    out, err = run('pm2 stop stella && pm2 stop stella-discord')
    print(out)
    if err:
        print('ERR:', err[:300])
    time.sleep(1)
    status()

def restart():
    print('Restarting Stella bots...')
    out, err = run('pm2 restart stella && pm2 restart stella-discord')
    print(out)
    if err:
        print('ERR:', err[:300])
    time.sleep(1)
    status()

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    {
        'start': start,
        'stop': stop,
        'restart': restart,
        'status': status,
    }.get(cmd, status)()
