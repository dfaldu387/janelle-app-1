/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

LogBox.ignoreAllLogs(true);

// Global error handler to prevent crash on startup
const defaultHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.log('JS Error:', error?.message, error?.stack);
  if (defaultHandler) defaultHandler(error, isFatal);
});

AppRegistry.registerComponent(appName, () => App);
