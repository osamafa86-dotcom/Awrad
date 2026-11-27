// Screens read safe-area insets; give unit tests the library's official mock provider values.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
