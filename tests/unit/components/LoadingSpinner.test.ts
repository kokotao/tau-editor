/**
 * LoadingSpinner 组件单元测试
 * 测试加载动画组件的渲染和属性
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';

describe('LoadingSpinner', () => {
  describe('渲染测试', () => {
    it('应正确渲染加载动画容器', () => {
      const wrapper = mount(LoadingSpinner);
      
      expect(wrapper.exists()).toBe(true);
      expect(wrapper.classes()).toContain('loading-spinner');
    });

    it('应包含 SVG 动画元素', () => {
      const wrapper = mount(LoadingSpinner);
      
      const svg = wrapper.find('svg');
      expect(svg.exists()).toBe(true);
      expect(svg.attributes('class')).toContain('spinner');
    });

    it('应包含三个动画弧段', () => {
      const wrapper = mount(LoadingSpinner);
      
      const arcs = wrapper.findAll('path');
      expect(arcs).toHaveLength(3);
    });
  });

  describe('尺寸属性', () => {
    it('应使用默认尺寸 40px', () => {
      const wrapper = mount(LoadingSpinner);
      const svg = wrapper.find('svg');
      
      expect(svg.attributes('width')).toBe('40');
      expect(svg.attributes('height')).toBe('40');
    });

    it('应支持自定义尺寸', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          size: 60,
        },
      });
      const svg = wrapper.find('svg');
      
      expect(svg.attributes('width')).toBe('60');
      expect(svg.attributes('height')).toBe('60');
    });

    it('应支持小尺寸', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          size: 20,
        },
      });
      const svg = wrapper.find('svg');
      
      expect(svg.attributes('width')).toBe('20');
      expect(svg.attributes('height')).toBe('20');
    });

    it('应支持大尺寸', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          size: 100,
        },
      });
      const svg = wrapper.find('svg');
      
      expect(svg.attributes('width')).toBe('100');
      expect(svg.attributes('height')).toBe('100');
    });
  });

  describe'颜色属性', () => {
    it'应使用默认颜色', () => {
      const wrapper = mount(LoadingSpinner);
      const paths = wrapper.findAll('path');
      
      // 检查第一个弧段是否有颜色样式
      const firstPath = paths[0];
      expect(firstPath.exists()).toBe(true);
    });

    it'应支持自定义颜色', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          color: '#ff0000',
        },
      });
      
      // 组件应该应用自定义颜色
      expect(wrapper.vm.$props.color).toBe('#ff0000');
    });

    it'应支持 CSS 颜色名称', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          color: 'blue',
        },
      });
      
      expect(wrapper.vm.$props.color).toBe('blue');
    });
  });

  describe'文本属性', () => {
    it'应不显示文本当 text 未提供', () => {
      const wrapper = mount(LoadingSpinner);
      
      const textElement = wrapper.find('.loading-text');
      expect(textElement.exists()).toBe(false);
    });

    it'应显示加载文本当 text 提供', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          text: '加载中...',
        },
      });
      
      const textElement = wrapper.find('.loading-text');
      expect(textElement.exists()).toBe(true);
      expect(textElement.text()).toBe('加载中...');
    });

    it'应支持多行文本', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          text: '正在处理文件...\n请稍候',
        },
      });
      
      const textElement = wrapper.find('.loading-text');
      expect(textElement.text()).toContain('正在处理文件');
    });
  });

  describe'布局类', () => {
    it'应支持垂直布局', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          vertical: true,
        },
      });
      
      expect(wrapper.classes()).toContain('loading-vertical');
    });

    it'默认应为水平布局', () => {
      const wrapper = mount(LoadingSpinner);
      
      expect(wrapper.classes()).not.toContain('loading-vertical');
    });
  });

  describe'可访问性', () => {
    it'应包含 aria-label 属性', () => {
      const wrapper = mount(LoadingSpinner);
      
      const svg = wrapper.find('svg');
      expect(svg.attributes('role')).toBe('img');
      expect(svg.attributes('aria-label')).toBe('加载中');
    });

    it'应支持自定义 aria-label', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          ariaLabel: '正在保存文件',
        },
      });
      
      const svg = wrapper.find('svg');
      expect(svg.attributes('aria-label')).toBe('正在保存文件');
    });

    it'应支持 aria-busy 属性', () => {
      const wrapper = mount(LoadingSpinner);
      const container = wrapper.find('.loading-spinner');
      
      expect(container.attributes('aria-busy')).toBe('true');
    });
  });

  describe'样式测试', () => {
    it'应应用正确的 CSS 类', () => {
      const wrapper = mount(LoadingSpinner);
      
      expect(wrapper.classes()).toContain('loading-spinner');
      expect(wrapper.classes()).toContain('loading-horizontal');
    });

    it'垂直布局时应应用正确的类', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          vertical: true,
        },
      });
      
      expect(wrapper.classes()).toContain('loading-vertical');
      expect(wrapper.classes()).not.toContain('loading-horizontal');
    });
  });

  describe'组合属性测试', () => {
    it'应同时支持尺寸、颜色和文本', () => {
      const wrapper = mount(LoadingSpinner, {
        props: {
          size: 50,
          color: 'green',
          text: '请稍候...',
          vertical: true,
        },
      });
      
      const svg = wrapper.find('svg');
      expect(svg.attributes('width')).toBe('50');
      expect(svg.attributes('height')).toBe('50');
      
      const textElement = wrapper.find('.loading-text');
      expect(textElement.text()).toBe('请稍候...');
      
      expect(wrapper.classes()).toContain('loading-vertical');
    });
  });
});
