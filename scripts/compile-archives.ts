/* eslint-disable no-console */
import * as fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import OSS from 'ali-oss';
import { Archive, Archives } from './data';
import secrets from './secrets.json';

const client = new OSS({
  region: 'oss-cn-beijing',
  accessKeyId: secrets.oss.accessKeyId,
  accessKeySecret: secrets.oss.accessKeySecret,
  bucket: 'lanting-public'
});

// eslint-disable-next-line no-underscore-dangle,@typescript-eslint/naming-convention
const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = `${__dirname}/../archives`;
// XXX boyang: old way
// const currentOrigs = fs.readdirSync(`${ARCHIVE_DIR}/origs`);
let currentOrigs: string[] = [];

function setField(archive: Archive, field: string, fileContent: string, archives: Archives) {
  const regexArr = toFieldRegex(field).exec(fileContent);
  if (regexArr && regexArr[1]) {
    const fieldVal = getFieldFromFieldLine(field, regexArr[1]);
    archive[field] = fieldVal;
    fileContent = fileContent.replace(regexArr[0], '');

    updateFreqMap(field, fieldVal, archives);
  } else {
    console.log('Failed to get field: ', field);
  }
  return fileContent;
}

function updateFreqMap(field: string, fieldVal: string | string[], archives: Archives) {
  if (['author', 'publisher', 'date', 'tag'].includes(field)) {
    if (typeof fieldVal === 'string') {
      archives.fieldFreqMap[field][fieldVal] = (archives.fieldFreqMap[field][fieldVal] || 0) + 1;
    } else {
      (fieldVal as string[]).forEach((v) => {
        archives.fieldFreqMap[field][v] = (archives.fieldFreqMap[field][v] || 0) + 1;
      });
    }
  }
}

function getFieldFromFieldLine(field: string, fieldLine: string) {
  switch (field) {
    case 'title':
    case 'publisher':
    case 'date':
    case 'chapter':
      return fieldLine;
    case 'author':
    case 'tag':
      return fieldLine
        .split(',')
        .map((s) => s.trim())
        .sort();
    default:
      return fieldLine;
  }
}

function toFieldRegex(field: string): RegExp {
  return new RegExp(`# ${field}\n(.*?)\n\n`);
}

function getIdFromCommentFilename(f: string) {
  return f.substring(0, f.indexOf('-'));
}

async function init() {
  currentOrigs = (await client.list({ prefix: 'archives/origs/', 'max-keys': 1000 }, {}))
    .objects
    .map(o => o.name.replace(/^archives\/origs\//, ''));
}

async function origsMap() {
  const commentsFiles = fs.readdirSync(`${ARCHIVE_DIR}/comments`);
  const archives = commentsFiles.map((f) => {
    console.log('Processing: ', f);

    const archive = new Archive();
    archive.id = getIdFromCommentFilename(f);

    const foundOrigs = currentOrigs.filter((orig) => {
      const parts = orig.split('.');
      let id;
      if (parts[0].includes('-')) {
        id = +parts[0].split('-')[0];
      } else {
        id = +parts[0];
      }
      return id === +archive.id;
    });
    archive.origs = foundOrigs;
    return archive;
  });
  const noOrig = archives.filter(a => (a.origs || []).length === 0).map(a => a.id);
  const noComment = currentOrigs.filter(o => !archives.find(a => `${  a.id}` === o.split('.')[0]));

  console.log('XXXTEMP noOrig noComment', noOrig, noComment);
}

async function compileArchives() {
  const compiledArchives = new Archives();

  const commentsFiles = fs.readdirSync(`${ARCHIVE_DIR}/comments`);
  console.log('Comments count: ', commentsFiles.length);

  const archives: Archive[] = commentsFiles.map((f) => {
    console.log('Processing: ', f);

    const archive = new Archive();
    archive.id = getIdFromCommentFilename(f);

    let fileContent: string = fs.readFileSync(`${ARCHIVE_DIR}/comments/${f}`, 'utf-8');

    ['title', 'author', 'publisher', 'date', 'chapter', 'tag'].forEach((field) => {
      fileContent = setField(archive, field, fileContent, compiledArchives);
    });
    archive.remarks = fileContent.replace('# remarks', '');

    const foundOrigs = currentOrigs.filter((orig) => {
      const parts = orig.split('.');
      let id;
      if (parts[0].includes('-')) {
        id = +parts[0].split('-')[0];
      } else {
        id = +parts[0];
      }
      return id === +archive.id;
    });
    archive.origs = foundOrigs;

    return archive;
  });

  compiledArchives.archives = {};
  archives.forEach((a) => {
    compiledArchives.archives[a.id] = a;
  });

  fs.writeFileSync(`${ARCHIVE_DIR}/archives.json`, JSON.stringify(compiledArchives));
}

async function main() {
  await init();
  await origsMap();
  // await compileArchives();
}

main();