/** Azure offers recorded-audio assessment only; importing the registry never loads the SDK runtime. */
import type { Provider } from '../../types';
import { azureAssessment } from './client';

export const azure: Provider = {
  info: { id: 'azure', keyUrl: 'https://portal.azure.com/' },
  assessment: azureAssessment,
};
