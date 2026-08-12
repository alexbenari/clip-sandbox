import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.resolve(__dirname, '..');
const candidatesDir = path.join(spikeRoot, 'candidates-source-code');
const manifestPath = path.join(spikeRoot, 'candidate-sources.json');

async function runGit(args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`git ${args.join(' ')} failed with code ${code}`));
    });
  });
}

async function ensureCandidateSource(candidate) {
  const targetPath = path.join(candidatesDir, candidate.targetFolder);
  try {
    await fs.access(targetPath);
    await runGit(['fetch', '--all', '--tags', '--prune'], targetPath);
  } catch {
    await runGit(['clone', candidate.repositoryUrl, targetPath], spikeRoot);
  }

  await runGit(['checkout', candidate.ref], targetPath);
}

async function main() {
  await fs.mkdir(candidatesDir, { recursive: true });
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);

  for (const candidate of manifest) {
    console.log(`\n==> Syncing ${candidate.name} (${candidate.ref})`);
    await ensureCandidateSource(candidate);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
