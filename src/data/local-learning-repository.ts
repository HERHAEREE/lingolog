import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLearningRepository } from './learning-repository';

export function createLocalLearningRepository() {
  return createLearningRepository(AsyncStorage);
}
