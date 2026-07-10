export class BrandingPage {
  constructor(page) {
    this.page = page;

    // Logo / Square Logo edit dialogs (each opens a crop dialog with its own file input)
    this.logoEditButton = page.getByRole('button', { name: 'Edit' }).nth(0);
    this.squareLogoEditButton = page.getByRole('button', { name: 'Edit' }).nth(1);
    this.uploadNewImageButton = page.getByRole('button', { name: 'Upload new image' });
    this.dialogFileInput = page.getByRole('dialog').locator('input[type="file"]').first();
    this.saveSelectionButton = page.getByRole('button', { name: 'Save selection' });
    this.dialogCloseButton = page.getByRole('dialog').getByRole('button', { name: 'Close' });

    // Company Color picker
    this.colorButton = page.getByRole('button', { name: /^#[0-9A-Fa-f]{6,8}$/ });
    this.colorHexInput = page.getByRole('dialog').locator('input[type="text"]').first();

    // Actions
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.resetButton = page.getByRole('button', { name: 'Reset', exact: true });

    // Success confirmation toast shown after a successful save
    this.successToast = page.getByText('Branding updated.');
  }

  //navigateToBranding
  async navigateToBranding() {
    await this.page.goto('/settings/branding');
    await this.saveButton.waitFor({ state: 'visible' });

    console.log('✅ Branding page has been loaded successfully...');
  }

  //uploadImage
  async uploadImage(editButton, imagePath) {
    await editButton.click();

    // If a logo already exists, the dialog opens straight into crop-existing-image
    // mode with no file input; "Upload new image" reveals the file picker.
    if (await this.uploadNewImageButton.isVisible().catch(() => false)) {
      await this.uploadNewImageButton.click();
    }

    await this.dialogFileInput.setInputFiles(imagePath);
    await this.saveSelectionButton.click();
    await this.dialogCloseButton.click();

    console.log('✅ Image has been uploaded and cropped successfully...');
  }

  //setBrandColor
  async setBrandColor(hexColor) {
    await this.colorButton.click();

    await this.colorHexInput.click();
    await this.colorHexInput.press('Control+a');
    await this.colorHexInput.pressSequentially(hexColor);
    await this.colorHexInput.press('Tab');
    await this.page.keyboard.press('Escape');

    console.log('✅ Brand color has been applied successfully...');
  }

  //saveBranding
  async saveBranding() {
    await this.saveButton.waitFor({ state: 'visible' });

    await Promise.all([
      this.successToast.waitFor({ state: 'visible', timeout: 8000 }),
      this.saveButton.click(),
    ]);

    console.log('✅ Branding has been saved successfully...');
  }

  //brandingCompany
  async brandingCompany(logoPath = 'test-data/test-icon.AVIF', squareLogoPath = 'test-data/logo.jpg', color = '#4F46E5') {
    await this.navigateToBranding();
    await this.uploadImage(this.logoEditButton, logoPath);
    await this.uploadImage(this.squareLogoEditButton, squareLogoPath);
    await this.setBrandColor(color);
    await this.saveBranding();
  }

  //resetBrandingCompany
  //
  // "Reset" discards unsaved edits on the form (it does not restore platform
  // defaults). This makes an unsaved color change, then clicks Reset and
  // returns the color before/after so the spec can assert it was discarded.
  async resetBrandingCompany() {
    await this.navigateToBranding();

    const colorBeforeEdit = await this.colorButton.textContent();

    await this.setBrandColor('#123456');

    await this.resetButton.click();
    await this.page.waitForTimeout(500);

    const colorAfterReset = await this.colorButton.textContent();

    console.log('✅ Reset has been triggered and unsaved changes were discarded...');

    return { colorBeforeEdit, colorAfterReset };
  }
}
