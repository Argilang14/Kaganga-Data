#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';

// Filter out flags that some package managers append (like --silent) which svelte-check doesn't accept
const forbidden = new Set(['--silent', '--silent=true', '--silent=false']);
const inputArgs = process.argv.slice(2).filter((arg) => !forbidden.has(arg));

// Ensure --tsconfig is provided by default if not present
const hasTsconfig = inputArgs.some((a) => a === '--tsconfig' || a.startsWith('--tsconfig='));
if (!hasTsconfig) inputArgs.unshift('--tsconfig', './tsconfig.json');

const binPath = path.join(process.cwd(), 'node_modules', 'svelte-check', 'bin', 'svelte-check');
const result = spawnSync(process.execPath, [binPath, ...inputArgs], { stdio: 'inherit' });

process.exit(result.status ?? 1);
