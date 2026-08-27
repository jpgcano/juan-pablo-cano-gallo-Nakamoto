// Fronteras de la arquitectura, verificadas por lint (no solo por convencion):
//
// 1) Ningun modulo importa el interior de otro. Solo su index.ts.
// 2) domain/ y application/ de cualquier modulo no importan fastify, pg,
//    openai, socket.io, jsonwebtoken ni argon2: son el codigo que no debe
//    saber que existe un framework web ni un driver de base de datos.
// 3) shared/ (kernel tecnico) no importa nada de modules/: la plomeria no
//    puede depender de una regla de negocio especifica.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';

const FRAMEWORK_IMPORTS = ['fastify', 'pg', 'openai', 'socket.io', 'jsonwebtoken', 'argon2'];

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
    },
    plugins: { '@typescript-eslint': tsPlugin, import: importPlugin },
    settings: {
      // Los imports usan sufijo .js (estilo ESM de TypeScript). Sin este
      // resolver, eslint-plugin-import no encuentra el .ts real detras del
      // especificador y la regla de fronteras de abajo no detecta nada.
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: ['./src/modules/messaging', './src/modules/copilot', './src/main'],
              from: './src/modules/identity',
              except: ['./index.ts'],
              message: 'Solo se puede importar modules/identity a traves de su index.ts.',
            },
            {
              target: ['./src/modules/identity', './src/modules/copilot', './src/main'],
              from: './src/modules/messaging',
              except: ['./index.ts'],
              message: 'Solo se puede importar modules/messaging a traves de su index.ts.',
            },
            {
              target: ['./src/modules/identity', './src/modules/messaging', './src/main'],
              from: './src/modules/copilot',
              except: ['./index.ts'],
              message: 'Solo se puede importar modules/copilot a traves de su index.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts', 'src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: FRAMEWORK_IMPORTS }],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/shared/**/*',
              from: './src/modules/**/*',
              message: 'shared/ es kernel tecnico: no puede depender de un modulo especifico.',
            },
          ],
        },
      ],
    },
  },
];
