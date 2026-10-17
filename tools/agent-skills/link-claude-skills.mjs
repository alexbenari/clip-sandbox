import { existsSync, lstatSync, mkdirSync, realpathSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Codex reads project skills from .agents/skills and Claude Code from .claude/skills. The skills live once,
// in .agents/skills, and .claude/skills links to them. The link is not committed: Git on Windows checks
// symbolic links out as plain files unless core.symlinks is enabled.
const projectFolder = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..'));
const skills = path.join(projectFolder, '.agents', 'skills');
const link = path.join(projectFolder, '.claude', 'skills');

function resolvesTo(candidate, target) {
  try {
    return realpathSync(candidate) === realpathSync(target);
  } catch {
    return false;
  }
}

// rmdir removes a Windows junction without touching its target; elsewhere a symbolic link is unlinked.
function removeLink(linkPath) {
  if (process.platform === 'win32') rmdirSync(linkPath);
  else unlinkSync(linkPath);
}

function createLink() {
  mkdirSync(path.dirname(link), { recursive: true });
  // A junction needs no Windows privilege but takes an absolute target; elsewhere a relative link survives moving the checkout.
  if (process.platform === 'win32') symlinkSync(skills, link, 'junction');
  else symlinkSync(path.join('..', '.agents', 'skills'), link, 'dir');
  console.log(`Linked ${link} to ${skills}.`);
}

function main() {
  if (!existsSync(skills)) return;
  const existing = lstatSync(link, { throwIfNoEntry: false });
  if (!existing) {
    createLink();
  } else if (existing.isSymbolicLink() && !existsSync(link)) {
    // A link left pointing nowhere, for example by a moved checkout, is replaced.
    removeLink(link);
    createLink();
  } else if (!existing.isSymbolicLink() || !resolvesTo(link, skills)) {
    console.warn(`${link} exists and is not a link to ${skills}; leaving it unchanged.`);
  }
}

try {
  main();
} catch (error) {
  // This runs from npm's prepare step; a failed link must not fail the install.
  console.warn(`Could not link ${link} to ${skills}: ${error.message}`);
}
