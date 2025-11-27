import React from 'react';
import { App as RootComponent } from './components/App';
import { ThemeProvider } from './shared/themes';

const App: React.FC = () => (
  <ThemeProvider>
    <RootComponent />
  </ThemeProvider>
);

export default App;