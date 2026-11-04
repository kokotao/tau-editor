import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MindmapImageNodeLayer from "@/components/editor/mindmap/MindmapImageNodeLayer.vue";
import { computeMindmapLayout } from "@/services/mindmapLayoutService";
import { createEmptyMindMapDocument } from "@/services/mindmapService";
import type { MindmapImageNode } from "@/services/mindmapImageNodeService";

function setup() {
  const document = createEmptyMindMapDocument("Root");
  document.topics.child = {
    id: "child",
    parentId: document.rootTopicId,
    childIds: [],
    text: "Child",
  };
  document.topics[document.rootTopicId]!.childIds = ["child"];
  const imageNode: MindmapImageNode = {
    id: "img-1",
    topicId: "child",
    src: "assets/a.png",
    alt: "A",
    width: 100,
    height: 80,
  };
  return { layout: computeMindmapLayout(document), imageNode };
}

describe("MindmapImageNodeLayer", () => {
  it("does not render image nodes for FREE users", () => {
    const { layout, imageNode } = setup();
    const wrapper = mount(MindmapImageNodeLayer, {
      props: {
        layout,
        viewport: { x: 0, y: 0, zoom: 1 },
        imageNodes: [imageNode],
        tier: "FREE",
      },
    });
    expect(
      wrapper.find('[data-testid="mindmap-image-node-layer"]').exists(),
    ).toBe(false);
  });

  it("positions paid image nodes from layout and viewport", () => {
    const { layout, imageNode } = setup();
    const wrapper = mount(MindmapImageNodeLayer, {
      props: {
        layout,
        viewport: { x: 10, y: 20, zoom: 2 },
        imageNodes: [imageNode],
        tier: "PLUS",
      },
    });
    const image = wrapper.find('[data-image-node-id="img-1"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes("style")).toContain("width: 200px");
    expect(image.attributes("style")).toContain("height: 160px");
    expect(image.find("img").attributes("src")).toBe("assets/a.png");
    expect(image.find("img").attributes("alt")).toBe("A");
  });

  it("emits click and image load errors without owning document state", async () => {
    const { layout, imageNode } = setup();
    const wrapper = mount(MindmapImageNodeLayer, {
      props: {
        layout,
        viewport: { x: 0, y: 0, zoom: 1 },
        imageNodes: [imageNode],
        tier: "PRO",
      },
    });
    await wrapper.find('[data-image-node-id="img-1"]').trigger("pointerdown");
    await wrapper.find('[data-image-node-id="img-1"]').trigger("click");
    expect(wrapper.emitted("click")?.[0]).toEqual([imageNode]);
    await wrapper.find("img").trigger("error");
    expect(wrapper.emitted("error")?.[0]).toEqual([imageNode]);
  });
});
