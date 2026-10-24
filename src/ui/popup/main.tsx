import { render } from 'preact';
import { startTheme } from '../theme';
import { Popup } from './Popup';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/popup.css';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app element');
startTheme();
render(<Popup />, root);
