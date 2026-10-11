import React from 'react';
import assert from 'node:assert/strict';
import TestRenderer, { act } from 'react-test-renderer';
import MockupStudio from '../components/MockupStudio';

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
});
Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const props = {
    isLoading: false,
    onClose: () => undefined,
    onGenerate: () => undefined,
};

let studio: TestRenderer.ReactTestRenderer;
await act(async () => {
    studio = TestRenderer.create(<MockupStudio {...props} />);
});

const cardButton = studio!.root.findAllByType('button').find(button => button.props.title === 'Add Card');
assert(cardButton, 'Card palette action should exist');

await act(async () => {
    cardButton.props.onClick();
});
assert.equal(studio!.root.findAll(node => node.props.className?.includes?.('mockup-element')).length, 1);

await act(async () => {
    studio!.unmount();
});
await act(async () => {
    studio = TestRenderer.create(<MockupStudio {...props} />);
});

assert.equal(
    studio!.root.findAll(node => node.props.className?.includes?.('mockup-element')).length,
    1,
    'Closing and reopening Mockup Studio must restore the wireframe draft',
);

console.log('Mockup wireframe survives an unmount/remount cycle.');
