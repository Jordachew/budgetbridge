"""Builds the app, serves dist/ on :8080, runs the four browser test parts, then stops the server."""
import subprocess, sys, time, os
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(root)
subprocess.run(['node', 'scripts/build.mjs'], check=True)
# The browser tests run against an empty config (no-account mode); the fake-Supabase part injects its own.
open('dist/config.js', 'w').write("window.ROADBOOK_CONFIG={supabaseUrl:'',supabaseKey:'',appName:'Roadbook',supportEmail:''};\n")
srv = subprocess.Popen(['node', 'scripts/serve.mjs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
bad = 0
try:
    for part in ['part1', 'part2', 'part3', 'part4']:
        r = subprocess.run([sys.executable, f'tests/e2e/{part}.py'])
        bad += r.returncode != 0
finally:
    srv.terminate()
sys.exit(1 if bad else 0)
