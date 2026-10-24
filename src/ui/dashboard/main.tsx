import { render } from 'preact';
import { startLanguage } from '../i18n';
import { startTheme } from '../theme';
import { Dashboard } from './Dashboard';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/dashboard.css';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app element');
startTheme();
startLanguage();
render(<Dashboard />, root);
