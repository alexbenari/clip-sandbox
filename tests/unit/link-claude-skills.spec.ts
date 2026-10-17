import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Test runs start in the repository root.
const script = path.resolve('tools', 'agent-skills', 'link-claude-skills.mjs');

describe('link-claude-skills', () => {
  let root: string;
  const agentSkill = (...parts: string[]) => path.join(root, '.agents', 'skills', ...parts);
  const claudeSkill = (...parts: string[]) => path.join(root, '.claude', 'skills', ...parts);
  const writeAgentSkill = (name: string, text: string) => {
    fs.mkdirSync(agentSkill(name), { recursive: true });
    fs.writeFileSync(agentSkill(name, 'SKILL.md'), text);
  };
  const runScript = () => {
    const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return { warnings: result.stderr };
  };
  const linkFolder = (folder: string, linkPath: string) => fs.symlinkSync(folder, linkPath, 'junction');

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'link-claude-skills-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('shows Claude Code each skill in .agents/skills through a link, not a copy', () => {
    writeAgentSkill('first', 'first skill');
    writeAgentSkill('second', 'second skill');
    runScript();

    fs.writeFileSync(agentSkill('first', 'SKILL.md'), 'edited first skill');

    expect(fs.readdirSync(claudeSkill()).sort()).toEqual(['first', 'second']);
    expect(fs.lstatSync(claudeSkill()).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('edited first skill');
    expect(fs.readFileSync(claudeSkill('second', 'SKILL.md'), 'utf8')).toBe('second skill');
  });

  it('recognizes its own links when run again', () => {
    writeAgentSkill('first', 'first skill');
    runScript();

    const { warnings } = runScript();

    expect(warnings).toBe('');
  });

  it('links a skill added later when run again', () => {
    writeAgentSkill('first', 'first skill');
    runScript();
    writeAgentSkill('second', 'second skill');

    runScript();

    expect(fs.readFileSync(claudeSkill('second', 'SKILL.md'), 'utf8')).toBe('second skill');
  });

  it('removes the link of a skill deleted from .agents/skills', () => {
    writeAgentSkill('first', 'first skill');
    writeAgentSkill('second', 'second skill');
    runScript();
    fs.rmSync(agentSkill('second'), { recursive: true });

    runScript();

    expect(fs.readdirSync(claudeSkill())).toEqual(['first']);
  });

  it('repairs a skill link left pointing nowhere, such as by a moved checkout', () => {
    writeAgentSkill('first', 'first skill');
    const oldLocation = path.join(root, 'old-location');
    fs.mkdirSync(oldLocation);
    fs.mkdirSync(claudeSkill(), { recursive: true });
    linkFolder(oldLocation, claudeSkill('first'));
    fs.rmSync(oldLocation, { recursive: true });

    runScript();

    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
  });

  it('keeps a real skill folder in .claude/skills and says so', () => {
    writeAgentSkill('first', 'first skill');
    fs.mkdirSync(claudeSkill('first'), { recursive: true });
    fs.writeFileSync(claudeSkill('first', 'SKILL.md'), 'own skill');

    const { warnings } = runScript();

    expect(warnings).toContain(`${claudeSkill('first')} exists and is not a link to`);
    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('own skill');
  });

  it('replaces a link to the whole skills folder without touching the skills', () => {
    writeAgentSkill('first', 'first skill');
    fs.mkdirSync(path.join(root, '.claude'));
    linkFolder(agentSkill(), claudeSkill());

    runScript();

    expect(fs.lstatSync(claudeSkill()).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
    expect(fs.readFileSync(agentSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
  });

  it('replaces a .claude/skills link left pointing nowhere with a folder of skill links', () => {
    writeAgentSkill('first', 'first skill');
    const oldLocation = path.join(root, 'old-location');
    fs.mkdirSync(oldLocation);
    fs.mkdirSync(path.join(root, '.claude'));
    linkFolder(oldLocation, claudeSkill());
    fs.rmSync(oldLocation, { recursive: true });

    runScript();

    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
  });

  it('leaves a .claude/skills link to another folder untouched and says so', () => {
    writeAgentSkill('first', 'first skill');
    const otherSkills = path.join(root, 'other-skills');
    fs.mkdirSync(otherSkills);
    fs.mkdirSync(path.join(root, '.claude'));
    linkFolder(otherSkills, claudeSkill());

    const { warnings } = runScript();

    expect(warnings).toContain(`${claudeSkill()} is a link to another folder`);
    expect(fs.realpathSync(claudeSkill())).toBe(fs.realpathSync(otherSkills));
    expect(fs.readdirSync(otherSkills)).toEqual([]);
  });

  it('creates nothing in a project without .agents/skills', () => {
    runScript();

    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
  });
});
