/** The product name on its own plate, top left. */
export function ProductPlate() {
  return (
    <ui-status-chip slot="top-start" label="Product">
      <ui-status-chip-part plain>
        <ui-logo name="OVR Driftless" />
      </ui-status-chip-part>
    </ui-status-chip>
  );
}
