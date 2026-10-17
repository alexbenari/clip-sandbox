import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Codex reads project skills from .agents/skills and Claude Code from .claude/skills. The skills live once,
// in .agents/skills, and each one is linked into .claude/skills. Claude Code does not discover skills
// through a link to the whole folder, only through links to each skill folder. The links are not committed:
// Git on Windows checks symbolic links out as plain files unless core.symlinks is enabled.
const projectFolder = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..'));
const agentSkills = path.join(projectFolder, '.agents', 'skills');
const claudeSkills = path.join(projectFolder, '.claude', 'skills');

function pointsTo(linkPath, folder) {
  try {
    return realpathSync(linkPath) === realpathSync(folder);
  } catch {
    return false;
  }
}

function isLink(candidate) {
  return lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

// rmdir removes a Windows junction without touching the folder it points to; elsewhere a symbolic link is unlinked.
function removeLink(linkPath) {
  if (process.platform === 'win32') rmdirSync(linkPath);
  else unlinkSync(linkPath);
}

// Returns whether .claude/skills can be used as a folder of skill links.
function prepareClaudeSkillsFolder() {
  if (isLink(claudeSkills)) {
    // An earlier version of this script linked the whole folder, and a moved checkout leaves that link pointing nowhere.
    if (pointsTo(claudeSkills, agentSkills) || !existsSync(claudeSkills)) {
      removeLink(claudeSkills);
    } else {
      console.warn(`${claudeSkills} is a link to another folder; leaving it unchanged.`);
      return false;
    }
  }
  mkdirSync(claudeSkills, { recursive: true });
  return true;
}

// A link whose folder is gone (a deleted skill, or a checkout that moved) is removed.
function removeBrokenLinks() {
  for (const name of readdirSync(claudeSkills)) {
    const linkPath = path.join(claudeSkills, name);
    if (isLink(linkPath) && !existsSync(linkPath)) removeLink(linkPath);
  }
}

function linkSkill(name) {
  const skillFolder = path.join(agentSkills, name);
  const linkPath = path.join(claudeSkills, name);
  if (lstatSync(linkPath, { throwIfNoEntry: false })) {
    if (!isLink(linkPath) || !pointsTo(linkPath, skillFolder)) {
      console.warn(`${linkPath} exists and is not a link to ${skillFolder}; leaving it unchanged.`);
    }
    return;
  }
  // A junction needs no Windows privilege but takes an absolute path; elsewhere a relative link survives moving the checkout.
  if (process.platform === 'win32') symlinkSync(skillFolder, linkPath, 'junction');
  else symlinkSync(path.relative(claudeSkills, skillFolder), linkPath, 'dir');
}

// This runs from npm's prepare step, so a failure only warns: it must not fail the install.
function warnAbout(action, error) {
  console.warn(`Could not ${action}: ${error.message}`);
}

function main() {
  if (!existsSync(agentSkills)) return;
  let skillNames;
  try {
    if (!prepareClaudeSkillsFolder()) return;
    removeBrokenLinks();
    skillNames = readdirSync(agentSkills, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  } catch (error) {
    warnAbout(`prepare ${claudeSkills}`, error);
    return;
  }
  for (const name of skillNames) {
    try {
      linkSkill(name);
    } catch (error) {
      warnAbout(`link the ${name} skill into ${claudeSkills}`, error);
    }
  }
}

main();
