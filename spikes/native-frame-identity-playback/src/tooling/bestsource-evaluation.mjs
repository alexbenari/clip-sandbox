export function evaluateFixture(fixture, events) {
  const source = events.find((event) => event.type === 'source');
  const frames = events.filter((event) => event.type === 'frame');
  const expected = new Map(fixture.frames.map((frame) => [frame.frameIndex, frame]));
  const reasons = [];

  if (!source) reasons.push('source metadata event is missing');
  if (source && source.numFrames !== fixture.frames.length) {
    reasons.push(`indexed ${source.numFrames} frames instead of ${fixture.frames.length}`);
  }
  if (source && (source.timebase.numerator !== fixture.timebase.numerator ||
      source.timebase.denominator !== fixture.timebase.denominator)) {
    reasons.push('source timebase differs from the fixture oracle');
  }

  for (const frame of frames) {
    const oracle = expected.get(frame.requestedFrame);
    if (!oracle) {
      reasons.push(`frame ${frame.requestedFrame} has no oracle entry`);
      continue;
    }
    if (frame.originalFrame !== frame.requestedFrame) {
      reasons.push(`frame ${frame.requestedFrame} mapped to original frame ${frame.originalFrame}`);
    }
    if (!frame.codeValid || frame.sourceCode !== oracle.sourceCode) {
      reasons.push(`frame ${frame.requestedFrame} displayed source code ${frame.sourceCode}`);
    }
    if (frame.pts !== oracle.pts || frame.frameInfoPts !== oracle.pts) {
      reasons.push(`frame ${frame.requestedFrame} PTS differs from ${oracle.pts}`);
    }
    if (frame.duration !== oracle.duration) {
      reasons.push(`frame ${frame.requestedFrame} duration differs from ${oracle.duration}`);
    }
  }

  const requiredOperations = ['forward', 'reverse', 'alternating', 'random-neighbors', 'repeat', 'boundaries'];
  for (const operation of requiredOperations) {
    if (!frames.some((frame) => frame.operation === operation)) reasons.push(`${operation} operation is missing`);
  }

  const repeat = frames.filter((frame) => frame.operation === 'repeat');
  if (repeat.length && new Set(repeat.map(identityKey)).size !== 1) {
    reasons.push('repeated frame requests changed canonical identity');
  }

  return {
    pass: reasons.length === 0 && frames.length > 0,
    reasons: [...new Set(reasons)],
    frameObservations: frames.length,
    p95AccessMs: percentile(frames.map((frame) => frame.latencyMs), 0.95),
  };
}

export function compareIdentityMaps(leftEvents, rightEvents) {
  const map = (events) => events.filter((event) => event.type === 'frame')
    .map((event) => [event.operation, event.operationIndex, identityKey(event)].join(':'));
  const left = map(leftEvents);
  const right = map(rightEvents);
  return {
    pass: left.length === right.length && left.every((value, index) => value === right[index]),
    leftCount: left.length,
    rightCount: right.length,
  };
}

export function parseJsonLines(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

export function summarizeBestSourceDebug(stderr) {
  const lines = String(stderr ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const count = (pattern) => lines.filter((line) => pattern.test(line)).length;
  return {
    lineCount: lines.length,
    ambiguousSeekCount: count(/unambigu/i),
    retryCount: count(/retrying seeking/i),
    badSeekLocationCount: count(/bad seek location/i),
    linearFallbackCount: count(/linear mode/i),
    corruptLandingCount: count(/corrupt frame/i),
    unseekableCount: count(/unseekable file/i),
    noFrameAfterSeekCount: count(/no frame could be decoded after seeking/i),
    relevantLines: lines.slice(0, 50),
  };
}

export function assessBestSourceGate(run, expectedMediaCount) {
  const fixturePass = run.mode === 'media-only' ||
    (run.fixtureResults.length === 6 && run.fixtureResults.every((result) => result.passed));
  const failurePass = run.mode === 'media-only' ||
    Boolean(run.malformed?.passed && run.cancellation?.passed && run.forcedTermination?.passed);
  const mediaPass = run.mode === 'fixtures-only' ||
    (run.mediaResults.length === expectedMediaCount && run.mediaResults.every((result) => result.passed));
  const warmRandomAccessPass = run.mode === 'fixtures-only' ||
    (run.mediaResults.length === expectedMediaCount && run.mediaResults.every((result) =>
      result.passed && warmAccessP95(result) !== null && warmAccessP95(result) <= 750));
  const initialIndexingPass = run.mode === 'fixtures-only' ||
    (run.resetIndexes === true && run.mediaResults.length === expectedMediaCount &&
      run.mediaResults.every((result) => result.passed &&
        result.first?.constructorMs !== null && result.first?.constructorMs !== undefined &&
        result.first.constructorMs <= 10 * 60_000));
  const completeEvidence = run.mode !== 'fixtures-only' && run.mode !== 'media-only' &&
    run.fixtureResults.length === 6 && run.mediaResults.length === expectedMediaCount;

  return {
    fixturePass,
    failurePass,
    mediaPass,
    warmRandomAccessPass,
    initialIndexingPass,
    completeEvidence,
    c2Pass: fixturePass && failurePass && mediaPass && warmRandomAccessPass &&
      initialIndexingPass && completeEvidence,
  };
}

function warmAccessP95(result) {
  return result.reopen?.p95AccessMs ?? result.first?.p95AccessMs ?? null;
}

function identityKey(frame) {
  return [frame.requestedFrame, frame.originalFrame, frame.pts, frame.duration,
    frame.timebase.numerator, frame.timebase.denominator, frame.rgbaHash, frame.frameInfoHash].join('|');
}
