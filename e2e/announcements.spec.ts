/**
 * Announcements E2E Tests
 * Tests the announcements feature including:
 * - Creating/editing/deleting announcements (FLEET/ADMIN)
 * - Viewing announcements in banner (all users)
 * - Mark as read functionality
 * - Visibility filtering (ALL_USERS vs QA_AND_ABOVE)
 * - Cross-app visibility via proxy pattern
 */

import { test, expect } from '@playwright/test';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  createTestUser,
  deleteTestUser,
  cleanupTestData,
  loginAsUser,
} from './helpers';

test.describe('Announcements - FLEET Management', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('FLEET user should be able to create announcement', async ({ page }) => {
    // Create and login as FLEET user
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    await loginAsUser(page, 'fleet@example.com', 'testpassword');

    // Navigate to Fleet app announcements page
    await page.goto('http://localhost:3004/announcements');

    // Verify page is accessible
    await expect(page.locator('h1:has-text("Announcements")')).toBeVisible();

    // Click Create Announcement button
    await page.click('button:has-text("Create Announcement")');

    // Verify modal opened
    await expect(page.locator('h2:has-text("Create Announcement")')).toBeVisible();

    // Fill in form
    await page.fill('input[type="text"]', 'System Maintenance Notice');
    await page.fill('textarea', 'We will be performing scheduled maintenance on Sunday from 2-4 AM EST.');

    // Select visibility (should default to ALL_USERS)
    await expect(page.locator('select').first()).toHaveValue('ALL_USERS');

    // Verify "Publish immediately" is checked by default
    const publishCheckbox = page.locator('input[type="checkbox"]');
    await expect(publishCheckbox).toBeChecked();

    // Submit
    await page.click('button:has-text("Create Announcement")');

    // Wait for modal to close and success message
    await page.waitForTimeout(1000);

    // Verify announcement appears in table
    await expect(page.locator('td:has-text("System Maintenance Notice")')).toBeVisible();
    await expect(page.locator('.statusBadge:has-text("Published")')).toBeVisible();
    await expect(page.locator('.statusBadge:has-text("All Users")')).toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
  });

  test('FLEET user should be able to edit announcement', async ({ page }) => {
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    await loginAsUser(page, 'fleet@example.com', 'testpassword');

    // Create announcement first
    await page.goto('http://localhost:3004/announcements');
    await page.click('button:has-text("Create Announcement")');
    await page.fill('input[type="text"]', 'Original Title');
    await page.fill('textarea', 'Original content');
    await page.click('button:has-text("Create Announcement")');
    await page.waitForTimeout(1000);

    // Click edit button
    await page.click('button[title="Edit"]');

    // Verify edit modal opened
    await expect(page.locator('h2:has-text("Edit Announcement")')).toBeVisible();

    // Update title
    await page.fill('input[type="text"]', 'Updated Title');

    // Submit changes
    await page.click('button:has-text("Save Changes")');
    await page.waitForTimeout(1000);

    // Verify changes appear in table
    await expect(page.locator('td:has-text("Updated Title")')).toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
  });

  test('FLEET user should be able to delete announcement', async ({ page }) => {
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    await loginAsUser(page, 'fleet@example.com', 'testpassword');

    // Create announcement first
    await page.goto('http://localhost:3004/announcements');
    await page.click('button:has-text("Create Announcement")');
    await page.fill('input[type="text"]', 'To Be Deleted');
    await page.fill('textarea', 'This will be deleted');
    await page.click('button:has-text("Create Announcement")');
    await page.waitForTimeout(1000);

    // Setup dialog handler for confirmation
    page.on('dialog', dialog => dialog.accept());

    // Click delete button
    await page.click('button[title="Delete"]');
    await page.waitForTimeout(1000);

    // Verify announcement is gone
    await expect(page.locator('td:has-text("To Be Deleted")')).not.toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
  });

  test('FLEET user should be able to create QA_AND_ABOVE announcement', async ({ page }) => {
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    await loginAsUser(page, 'fleet@example.com', 'testpassword');

    await page.goto('http://localhost:3004/announcements');
    await page.click('button:has-text("Create Announcement")');

    await page.fill('input[type="text"]', 'Internal QA Update');
    await page.fill('textarea', 'New quality guidelines for Project X');

    // Change visibility to QA_AND_ABOVE
    await page.selectOption('select', 'QA_AND_ABOVE');

    await page.click('button:has-text("Create Announcement")');
    await page.waitForTimeout(1000);

    // Verify visibility badge shows "QA & Above"
    await expect(page.locator('.statusBadge:has-text("QA & Above")')).toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
  });

  test('FLEET user should be able to create draft announcement', async ({ page }) => {
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    await loginAsUser(page, 'fleet@example.com', 'testpassword');

    await page.goto('http://localhost:3004/announcements');
    await page.click('button:has-text("Create Announcement")');

    await page.fill('input[type="text"]', 'Draft Announcement');
    await page.fill('textarea', 'This is a draft');

    // Uncheck "Publish immediately"
    await page.uncheck('input[type="checkbox"]');

    await page.click('button:has-text("Create Announcement")');
    await page.waitForTimeout(1000);

    // Verify status shows "Draft"
    await expect(page.locator('.statusBadge:has-text("Draft")')).toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
  });

  test('Regular USER should not be able to access announcements management', async ({ page }) => {
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');

    // Try to navigate to announcements management page
    await page.goto('http://localhost:3004/announcements');

    // Should be redirected to home (unauthorized)
    await expect(page).toHaveURL('http://localhost:3004/');

    // Cleanup
    await deleteTestUser('user@example.com');
  });
});

test.describe('Announcements - Banner and Read Tracking', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('Published announcement should appear in banner for regular user', async ({ page, context }) => {
    // Create FLEET user and announcement
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'Important Update');
    await fleetPage.fill('textarea', 'Please read this important update');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Create regular user and check banner
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');

    // Navigate to User app (different app from where announcement was created)
    await page.goto('http://localhost:3001/');

    // Verify banner appears with unread count
    const banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.badge')).toHaveText('1');
    await expect(banner).toContainText('Important Update');

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });

  test('User should be able to mark announcement as read', async ({ page, context }) => {
    // Create announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'Read Me');
    await fleetPage.fill('textarea', 'Mark this as read');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Login as regular user
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    // Verify banner appears
    const banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();

    // Click to expand banner if collapsed
    if (await banner.locator('.expandIcon').isVisible()) {
      await banner.locator('.expandIcon').click();
    }

    // Click announcement to mark as read
    await page.click('text=Read Me');
    await page.waitForTimeout(1000);

    // Banner should disappear or show 0 unread
    await expect(banner).not.toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });

  test('Read status should persist across different apps', async ({ page, context }) => {
    // Create announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'Cross-App Test');
    await fleetPage.fill('textarea', 'Testing cross-app persistence');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Login as user and mark as read in User app
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    const banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();

    if (await banner.locator('.expandIcon').isVisible()) {
      await banner.locator('.expandIcon').click();
    }

    await page.click('text=Cross-App Test');
    await page.waitForTimeout(1000);

    // Navigate to QA app (different app)
    await page.goto('http://localhost:3002/');

    // Banner should NOT appear (already read)
    await expect(banner).not.toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });

  test('Draft announcement should NOT appear in banner', async ({ page, context }) => {
    // Create draft announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'Draft Announcement');
    await fleetPage.fill('textarea', 'This is a draft');
    await fleetPage.uncheck('input[type="checkbox"]'); // Uncheck "Publish immediately"
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Login as regular user
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    // Banner should NOT appear (draft not published)
    const banner = page.locator('.announcementsBanner');
    await expect(banner).not.toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });
});

test.describe('Announcements - Visibility Filtering', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('QA_AND_ABOVE announcement should NOT be visible to regular USER', async ({ page, context }) => {
    // Create QA_AND_ABOVE announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'Internal QA Announcement');
    await fleetPage.fill('textarea', 'This is for QA and above only');
    await fleetPage.selectOption('select', 'QA_AND_ABOVE');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Login as regular USER
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    // Banner should NOT appear (not authorized to see QA_AND_ABOVE)
    const banner = page.locator('.announcementsBanner');
    await expect(banner).not.toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });

  test('QA_AND_ABOVE announcement SHOULD be visible to QA user', async ({ page, context }) => {
    // Create QA_AND_ABOVE announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'QA Team Update');
    await fleetPage.fill('textarea', 'New guidelines for QA team');
    await fleetPage.selectOption('select', 'QA_AND_ABOVE');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Login as QA user
    const qa = await createTestUser('qa@example.com', 'QA');
    await loginAsUser(page, 'qa@example.com', 'testpassword');
    await page.goto('http://localhost:3002/');

    // Banner SHOULD appear
    const banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('QA Team Update');

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('qa@example.com');
  });

  test('ALL_USERS announcement should be visible to everyone', async ({ page, context }) => {
    // Create ALL_USERS announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'System-Wide Announcement');
    await fleetPage.fill('textarea', 'Everyone should see this');
    // Visibility defaults to ALL_USERS
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Test with regular USER
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    const banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('System-Wide Announcement');

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });

  test('Changing visibility from ALL_USERS to QA_AND_ABOVE should hide from regular users', async ({ page, context }) => {
    // Create ALL_USERS announcement as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.fill('input[type="text"]', 'Changing Visibility');
    await fleetPage.fill('textarea', 'This will change visibility');
    await fleetPage.click('button:has-text("Create Announcement")');
    await fleetPage.waitForTimeout(1000);

    // Verify USER can see it first
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    let banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();

    // Go back to FLEET and change visibility
    await fleetPage.click('button[title="Edit"]');
    await fleetPage.selectOption('select', 'QA_AND_ABOVE');
    await fleetPage.click('button:has-text("Save Changes")');
    await fleetPage.waitForTimeout(1000);
    await fleetPage.close();

    // Refresh user page
    await page.reload();
    await page.waitForTimeout(1000);

    // Banner should now be hidden
    banner = page.locator('.announcementsBanner');
    await expect(banner).not.toBeVisible();

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });
});

test.describe('Announcements - Multiple Announcements', () => {
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await teardownTestEnvironment();
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('Banner should show correct count with multiple unread announcements', async ({ page, context }) => {
    // Create 3 announcements as FLEET
    const fleet = await createTestUser('fleet@example.com', 'FLEET');
    const fleetPage = await context.newPage();
    await loginAsUser(fleetPage, 'fleet@example.com', 'testpassword');
    await fleetPage.goto('http://localhost:3004/announcements');

    for (let i = 1; i <= 3; i++) {
      await fleetPage.click('button:has-text("Create Announcement")');
      await fleetPage.fill('input[type="text"]', `Announcement ${i}`);
      await fleetPage.fill('textarea', `Content ${i}`);
      await fleetPage.click('button:has-text("Create Announcement")');
      await fleetPage.waitForTimeout(1000);
    }
    await fleetPage.close();

    // Login as user
    const user = await createTestUser('user@example.com', 'USER');
    await loginAsUser(page, 'user@example.com', 'testpassword');
    await page.goto('http://localhost:3001/');

    // Verify banner shows count of 3
    const banner = page.locator('.announcementsBanner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.badge')).toHaveText('3');

    // Cleanup
    await deleteTestUser('fleet@example.com');
    await deleteTestUser('user@example.com');
  });
});
