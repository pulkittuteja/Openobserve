const { BasePage } = require('./BasePage');

class PipelinesPage extends BasePage {
  constructor(page) {
    super(page);
    this.pipelinesNavLink = page.locator('[data-test="menu-link-/pipeline-item"]');
    this.addPipelineButton = page.locator('[data-test="pipeline-list-add-pipeline-btn"]');
    this.pipelineNameInput = page.getByPlaceholder('Enter Pipeline Name');
    this.savePipelineButton = page.locator('[data-test="add-pipeline-save-btn"]');
    this.cancelPipelineButton = page.locator('[data-test="add-pipeline-cancel-btn"]');

    this.flowPane = page.locator('.vue-flow__pane');
    this.sourceStreamPalette = page.locator('button[draggable="true"]', { hasText: /^Stream$/ }).first();
    this.destinationStreamPalette = page.locator('button[draggable="true"]', { hasText: /^Stream$/ }).last();
    this.nodeDialog = page.locator('.q-dialog').last();
    this.nodeStreamTypeField = this.nodeDialog
      .locator('.q-field:has(.q-field__label:text-is("Stream Type *")) [role="combobox"]');
    this.nodeStreamNameField = this.nodeDialog
      .locator('.q-field:has(.q-field__label:text-is("Stream Name *")) [role="combobox"]');
    this.nodeSaveButton = page.locator('[data-test="input-node-stream-save-btn"]');
    this.nodeCancelButton = page.locator('[data-test="input-node-stream-cancel-btn"]');

    this.defaultOutputDeleteBtn = page.locator('[data-test="pipeline-node-output-delete-btn"]');
    this.confirmOkButton = page.locator('[data-test="confirm-button"]');
    this.sourceOutputHandle = page.locator('[data-test="pipeline-node-input-output-handle"]');
    this.destinationInputHandle = page.locator('[data-test="pipeline-node-output-input-handle"]');
  }

  async open() {
    await this.pipelinesNavLink.click();
    await this.page.waitForURL(/\/web\/pipeline/);
    await this.addPipelineButton.waitFor();
  }

  async createStreamToStreamPipeline({ name, sourceStream, destinationStream }) {
    await this.addPipelineButton.click();
    await this.page.waitForURL(/\/pipeline\/pipelines\/add/);

    await this.pipelineNameInput.fill(name);

    await this._dragPaletteToCanvas(this.sourceStreamPalette);
    await this._pickQuasarOption(this.nodeStreamNameField, sourceStream);
    await this.nodeSaveButton.click();

    const outputNode = this.page.locator('.vue-flow__node.vue-flow__node-output');
    await outputNode.waitFor();
    await outputNode.hover();
    await this.defaultOutputDeleteBtn.click();
    await this.confirmOkButton.click();
    await outputNode.waitFor({ state: 'detached' });
    await this._dragPaletteToCanvas(this.destinationStreamPalette, { offsetX: 0.2, offsetY: 0.2 });
    await this._pickQuasarOption(this.nodeStreamNameField, destinationStream);
    await this.nodeSaveButton.click();
    await this.nodeSaveButton.waitFor({ state: 'detached' });
    await this.sourceOutputHandle.waitFor();
    await this.destinationInputHandle.waitFor();
    const srcBox = await this.sourceOutputHandle.boundingBox();
    const tgtBox = await this.destinationInputHandle.boundingBox();
    if (!srcBox || !tgtBox) throw new Error('handles not visible');
    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;
    const tx = tgtBox.x + tgtBox.width / 2;
    const ty = tgtBox.y + tgtBox.height / 2;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
      await this.page.mouse.move(
        sx + ((tx - sx) * i) / 10,
        sy + ((ty - sy) * i) / 10,
        { steps: 2 },
      );
    }
    await this.page.mouse.up();

    await this.savePipelineButton.click();
    await this.page.waitForURL(/\/pipeline\/pipelines(?!\/add)/);
  }
  async _dragPaletteToCanvas(paletteBtn, { offsetX = 0.5, offsetY = 0.5 } = {}) {
    const paletteHandle = await paletteBtn.elementHandle();
    const paneHandle = await this.flowPane.elementHandle();
    if (!paletteHandle || !paneHandle) throw new Error('palette/pane missing');

    await this.page.evaluate(
      ({ palette, pane, fx, fy }) => {
        const pr = pane.getBoundingClientRect();
        const sr = palette.getBoundingClientRect();
        const sx = sr.left + sr.width / 2;
        const sy = sr.top + sr.height / 2;
        const ex = pr.left + pr.width * fx;
        const ey = pr.top + pr.height * fy;
        const dt = new DataTransfer();
        const d = (el, type, x, y) =>
          el.dispatchEvent(
            new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }),
          );
        d(palette, 'dragstart', sx, sy);
        d(pane, 'dragenter', ex, ey);
        d(pane, 'dragover', ex, ey);
        d(pane, 'drop', ex, ey);
        d(palette, 'dragend', ex, ey);
      },
      { palette: paletteHandle, pane: paneHandle, fx: offsetX, fy: offsetY },
    );

    await this.nodeSaveButton.waitFor();
  }
  async _pickQuasarOption(wrapper, optionText) {
    await wrapper.click();
    await this.page
      .locator('.q-menu [role="option"]')
      .filter({ hasText: new RegExp(`^${escapeRegExp(optionText)}$`) })
      .first()
      .click();
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { PipelinesPage };
