/** Owns AI settings field and save locators, not request mocks or test cases. */
import type { Page } from '@playwright/test';

export const modelField = (page: Page) => page.getByLabel('Model', { exact: true });
export const keyField = (page: Page) => page.getByPlaceholder('Paste your key here');
export const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
