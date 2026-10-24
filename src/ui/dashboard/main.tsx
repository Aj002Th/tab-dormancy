import { render } from 'preact';
import { startTheme } from '../theme';
import { Dashboard } from './Dashboard';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/dashboard.css';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app element');
startTheme();
render(<Dashboard />, root);
