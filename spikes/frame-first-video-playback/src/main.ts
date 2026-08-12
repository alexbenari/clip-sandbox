import { ComparisonHost } from './host/comparison-host';
import { MediabunnyControl } from './candidates/mediabunny/mediabunny-control';
import { WebCodecsExamplesControl } from './candidates/webcodecs-examples/webcodecs-examples-control';
import './styles/styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point.');
}

const host = new ComparisonHost({
  'candidate-a': new WebCodecsExamplesControl(),
  'candidate-b': new MediabunnyControl(),
});
host.mount(app);

window.addEventListener('beforeunload', () => {
  void host.dispose();
});
