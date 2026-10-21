import { render } from 'preact';
import { Dashboard } from './Dashboard';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/dashboard.css';

render(<Dashboard />, document.getElementById('app')!);
