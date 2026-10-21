import { render } from 'preact';
import { Popup } from './Popup';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/popup.css';

render(<Popup />, document.getElementById('app')!);
