import { google } from 'googleapis'
import { Readable } from 'stream'
import type { OAuth2Client } from 'google-auth-library'
import type { ClassSlot, StudentMode } from '@/lib/types'

const EMPTY_IPYNB = JSON.stringify({
  cells: [{ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: [] }],
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.12.0' },
  },
  nbformat: 4,
  nbformat_minor: 4,
})

async function createFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return res.data.id!
}

async function createShortcut(drive: ReturnType<typeof google.drive>, targetId: string, parentId: string, name: string) {
  await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: [parentId],
      shortcutDetails: { targetId },
    },
  })
}

async function uploadIpynb(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  await drive.files.create({
    requestBody: { name: `${name}.ipynb`, parents: [parentId] },
    media: { mimeType: 'application/x-ipynb+json', body: Readable.from([EMPTY_IPYNB]) },
  })
}

async function createBlankDoc(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    },
  })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`
}

function buildMeetDocHtml(studentName: string, schedule: ClassSlot[], meetLink: string): string {
  const slotLines = schedule.map(s => `${esc(s.day)} · ${fmt(s.start)} – ${fmt(s.end)}`).join('<br>')
  const safeLink = esc(meetLink)
  return [
    `<p>${esc(studentName)}</p>`,
    `<p><br></p>`,
    `<p>${slotLines}</p>`,
    `<p><br></p>`,
    `<p>Time zone: Asia/Kuala_Lumpur<br>Google Meet joining info<br>Video call link: <a href="${safeLink}" style="color:#1155CC">${safeLink}</a></p>`,
    `<p><br></p><p>The same link will be used for the other time as well.</p>`,
  ].join('')
}

async function createMeetDoc(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  studentName: string,
  schedule: ClassSlot[],
  meetLink: string,
) {
  await drive.files.create({
    requestBody: { name: 'Google Meet Link', mimeType: 'application/vnd.google-apps.document', parents: [parentId] },
    media: { mimeType: 'text/html', body: Readable.from([buildMeetDocHtml(studentName, schedule, meetLink)]) },
  })
}

export function parseDriveFolderId(driveFolderUrl: string): string {
  const rawId = driveFolderUrl.split('/folders/')[1]?.split('?')[0]?.split('/')[0]
  if (!rawId) throw new Error('Could not parse folder ID from Drive URL')
  if (!/^[a-zA-Z0-9_-]+$/.test(rawId)) throw new Error('Invalid folder ID in Drive URL')
  return rawId
}

export async function updateStudentMeetDoc(
  auth: OAuth2Client,
  driveFolderUrl: string,
  studentName: string,
  schedule: ClassSlot[],
  meetLink: string,
): Promise<void> {
  const folderId = parseDriveFolderId(driveFolderUrl)

  const drive = google.drive({ version: 'v3', auth })
  const search = await drive.files.list({
    q: `'${folderId}' in parents and name = 'Google Meet Link' and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  const docId = search.data.files?.[0]?.id
  if (!docId) throw new Error('Google Meet Link doc not found in student Drive folder')

  await drive.files.update({
    fileId: docId,
    requestBody: {},
    media: { mimeType: 'text/html', body: Readable.from([buildMeetDocHtml(studentName, schedule, meetLink)]) },
  })
}

export async function createStudentDriveFolder(
  auth: OAuth2Client,
  studentName: string,
  meetLink: string,
  classSchedule: ClassSlot[],
  mode: StudentMode = 'My Python Syllabus',
): Promise<string> {
  const studentsFolderId = process.env.GOOGLE_STUDENTS_FOLDER_ID
  if (!studentsFolderId) throw new Error('GOOGLE_STUDENTS_FOLDER_ID env var is not set')
  const lecTopic1FileId = process.env.GOOGLE_LEC_TOPIC1_FILE_ID
  if (mode === 'My Python Syllabus' && !lecTopic1FileId) throw new Error('GOOGLE_LEC_TOPIC1_FILE_ID env var is not set')

  const drive = google.drive({ version: 'v3', auth })

  const rootId = await createFolder(drive, studentName, studentsFolderId)
  await drive.permissions.create({
    fileId: rootId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  try {
    if (mode === 'My Python Syllabus') {
      await Promise.all([
        (async () => {
          const teachingId = await createFolder(drive, '1. Teaching Slides', rootId)
          await createShortcut(drive, lecTopic1FileId!, teachingId, 'Topic_1.pptx')
        })(),
        (async () => {
          const codingId = await createFolder(drive, '2. In-Class Coding Examples', rootId)
          await uploadIpynb(drive, `${studentName} Topic 1`, codingId)
        })(),
        (async () => {
          const hwQId = await createFolder(drive, '3. Homework Questions', rootId)
          await createBlankDoc(drive, `${studentName} Topic 1 Homework`, hwQId)
        })(),
        (async () => {
          const hwAnsId = await createFolder(drive, '4. Homework Sample Answers', rootId)
          await uploadIpynb(drive, `${studentName} Homework Topic 1`, hwAnsId)
        })(),
        createMeetDoc(drive, rootId, studentName, classSchedule, meetLink),
      ])
    } else {
      await createMeetDoc(drive, rootId, studentName, classSchedule, meetLink)
    }
  } catch (err) {
    // Clean up root folder so a retry doesn't create duplicates
    await drive.files.delete({ fileId: rootId }).catch(() => null)
    throw err
  }

  return `https://drive.google.com/drive/folders/${rootId}`
}
