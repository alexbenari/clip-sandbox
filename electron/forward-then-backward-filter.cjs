// The FFmpeg filter graph of Loopify: the frames play forward, then the same frames backward, without sound.
class ForwardThenBackwardFilter {
  static graph(input, preparation = '') {
    return `[${input}]${preparation}split=2[forward][reverse];[reverse]reverse[backward];`
      + '[forward][backward]concat=n=2:v=1:a=0[looped]';
  }

  static get output() {
    return '[looped]';
  }
}

module.exports = { ForwardThenBackwardFilter };
