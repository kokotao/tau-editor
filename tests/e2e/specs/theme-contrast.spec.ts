import { expect, test } from "@playwright/test";

const skins = [
  "deep-ocean",
  "forest-moss",
  "solar-sand",
  "graphite-ink",
  "rose-dawn",
];

function contrastRatio(foreground: string, background: string): number {
  const parse = (value: string) => {
    const matches = value.match(/[0-9a-f]{2}/gi);
    if (!matches || matches.length < 3) {
      return null;
    }
    return matches
      .slice(0, 3)
      .map((channel) => Number.parseInt(channel, 16) / 255);
  };

  const toLinear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = (value: string) => {
    const channels = parse(value);
    if (!channels) {
      return Number.NaN;
    }
    const [red, green, blue] = channels.map(toLinear);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test.describe("Theme contrast defaults", () => {
  test("all built-in skins keep readable primary and secondary text", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="toolbar"]');

    const results = await page.evaluate((skinNames) => {
      const root = document.documentElement;
      const values: Array<{
        mode: string;
        skin: string;
        background: string;
        panel: string;
        primary: string;
        secondary: string;
      }> = [];

      for (const mode of ["dark", "light"]) {
        for (const skin of skinNames) {
          root.className = `${mode} theme-${mode} skin-${skin}`;
          const styles = getComputedStyle(root);
          values.push({
            mode,
            skin,
            background: styles.getPropertyValue("--bg-app").trim(),
            panel: styles.getPropertyValue("--panel-base").trim(),
            primary: styles.getPropertyValue("--text-primary").trim(),
            secondary: styles.getPropertyValue("--text-secondary").trim(),
          });
        }
      }
      return values;
    }, skins);

    for (const result of results) {
      expect(
        contrastRatio(result.primary, result.background),
        `${result.mode}/${result.skin} primary text vs app background`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(result.secondary, result.panel),
        `${result.mode}/${result.skin} secondary text vs panel`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
