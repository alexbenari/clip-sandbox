import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Test runs start in the repository root.
const script = path.resolve('tools', 'agent-skills', 'link-claude-skills.mjs');

describe('link-claude-skills', () => {
  let root: string;
  const claudeSkill = (...parts: string[]) => path.join(root, '.claude', 'skills', ...parts);
  const writeAgentSkill = (name: string, text: string) => {
    fs.mkdirSync(path.join(root, '.agents', 'skills', name), { recursive: true });
    fs.writeFileSync(path.join(root, '.agents', 'skills', name, 'SKILL.md'), text);
  };
  const runScript = () => {
    const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return { warnings: result.stderr };
  };

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'link-claude-skills-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('shows Claude Code the same skills as .agents/skills, including ones added later', () => {
    writeAgentSkill('first', 'first skill');
    runScript();
    writeAgentSkill('second', 'second skill');

    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
    expect(fs.readFileSync(claudeSkill('second', 'SKILL.md'), 'utf8')).toBe('second skill');
  });

  it('recognizes its own link when run again', () => {
    writeAgentSkill('first', 'first skill');
    runScript();

    const { warnings } = runScript();

    expect(warnings).toBe('');
    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
  });

  it('leaves an existing .claude/skills folder untouched and says so', () => {
    writeAgentSkill('first', 'first skill');
    fs.mkdirSync(claudeSkill('own'), { recursive: true });
    fs.writeFileSync(claudeSkill('own', 'SKILL.md'), 'own skill');

    const { warnings } = runScript();

    expect(warnings).toContain(`${claudeSkill()} exists and is not a link to`);
    expect(fs.readdirSync(claudeSkill())).toEqual(['own']);
    expect(fs.readFileSync(claudeSkill('own', 'SKILL.md'), 'utf8')).toBe('own skill');
  });

  it('replaces a link that points nowhere, such as one left by a moved checkout', () => {
    writeAgentSkill('first', 'first skill');
    const removedTarget = path.join(root, 'old-location');
    fs.mkdirSync(removedTarget);
    fs.mkdirSync(path.join(root, '.claude'));
    fs.symlinkSync(removedTarget, claudeSkill(), 'junction');
    fs.rmSync(removedTarget, { recursive: true });

    runScript();

    expect(fs.readFileSync(claudeSkill('first', 'SKILL.md'), 'utf8')).toBe('first skill');
  });

  it('creates nothing in a project without .agents/skills', () => {
    runScript();

    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
  });
});
