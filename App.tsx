import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import DarkAlertProvider from './src/components/DarkAlert';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AuthProvider>
        <DarkAlertProvider>
          <AppNavigator />
        </DarkAlertProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
