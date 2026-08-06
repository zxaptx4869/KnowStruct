import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 某些运行环境（如 Node --experimental-webstorage 未带有效路径）会把
// window.localStorage 替换为无方法的内置 stub，导致依赖本地存储的测试不可用。
// 仅在检测到实现损坏时注入内存版 Storage，标准 jsdom 环境不受影响。
if (typeof window.localStorage?.clear !== 'function') {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(String(key), String(value))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
}

afterEach(() => cleanup())
