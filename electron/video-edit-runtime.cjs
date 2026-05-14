const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { createFolderEntry } = require('./folder-entry.cjs');
const { resolveFfmpegBinary } = require('./ffmpeg-resolver.cjs');

function validatePayload(payload = {}) {
  const sourcePath = String(payload.sourcePath || '').trim();
  const outputFolderPath = String(payload.outputFolderPath || '').trim();
  const preferredOutputFilename = String(payload.preferredOutputFilename || '').trim();
  const editId = String(payload.editId || '').trim();

  if (!editId || editId !== 'loopify') {
    return { ok: false, code: 'invalid-edit' };
  }
  if (!sourcePath) {
    return { ok: false, code: 'missing-source' };
  }
  if (!outputFolderPath || !preferredOutputFilename) {
    return { ok: false, code: 'invalid-output' };
  }

  return {
    ok: true,
    editId,
    outputFolderPath,
    preferredOutputFilename,
    sourcePath,
  };
}

async function resolveAvailableOutputPath(outputFolderPath, preferredOutputFilename, {
  access = fs.access.bind(fs),
} = {}) {
  const parsed = path.parse(preferredOutputFilename);
  const baseName = parsed.name || preferredOutputFilename;
  const ext = parsed.ext || '.mp4';
  let attempt = 1;

  while (true) {
    const filename = attempt === 1 ? `${baseName}${ext}` : `${baseName}-${attempt}${ext}`;
    const absolutePath = path.join(outputFolderPath, filename);
    try {
      await access(absolutePath);
      attempt += 1;
    } catch {
      return {
        filename,
        absolutePath,
      };
    }
  }
}

function createLoopifyArgs(sourcePath, outputPath) {
  return [
    '-y',
    '-i',
    sourcePath,
    '-filter_complex',
    '[0:v]split=2[forward][reverse];[reverse]reverse[backward];[forward][backward]concat=n=2:v=1:a=0[video]',
    '-map',
    '[video]',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

function runProcess(command, args, {
  cwd = process.cwd(),
  spawnProcess = spawn,
} = {}) {
  return new Promise((resolve) => {
    const child = spawnProcess(command, args, {
      cwd,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', (error) => {
      resolve({
        ok: false,
        code: 'process-failed',
        error,
      });
    });
    child.once('close', (exitCode) => {
      resolve({
        ok: exitCode === 0,
        code: exitCode === 0 ? 'completed' : 'process-failed',
        exitCode,
      });
    });
  });
}

function createVideoEditRuntime({
  access = fs.access.bind(fs),
  resolveBinary = resolveFfmpegBinary,
  runCommand = runProcess,
  createEntry = createFolderEntry,
} = {}) {
  return {
    async createVideoEdit(payload = {}) {
      const validated = validatePayload(payload);
      if (!validated.ok) {
        return validated;
      }

      try {
        await access(validated.sourcePath);
      } catch {
        return { ok: false, code: 'missing-source' };
      }

      let binaryPath = '';
      try {
        binaryPath = resolveBinary();
      } catch (error) {
        return { ok: false, code: error?.code || 'missing-binary' };
      }

      const output = await resolveAvailableOutputPath(validated.outputFolderPath, validated.preferredOutputFilename, {
        access,
      });
      const runResult = await runCommand(binaryPath, createLoopifyArgs(validated.sourcePath, output.absolutePath), {
        cwd: validated.outputFolderPath,
      });
      if (!runResult.ok) {
        return {
          ok: false,
          code: 'process-failed',
        };
      }

      try {
        await access(output.absolutePath);
      } catch {
        return { ok: false, code: 'output-missing' };
      }

      return {
        ok: true,
        createdFile: await createEntry(output.absolutePath),
      };
    },
  };
}

async function createVideoEdit(payload = {}) {
  return createVideoEditRuntime().createVideoEdit(payload);
}

module.exports = {
  createLoopifyArgs,
  createVideoEdit,
  createVideoEditRuntime,
  resolveAvailableOutputPath,
  validatePayload,
};
