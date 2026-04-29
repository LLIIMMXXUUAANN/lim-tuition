import { google } from 'googleapis'
import { Readable } from 'stream'
import type { OAuth2Client } from 'google-auth-library'

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

interface ClassSlot { day: string; start: string; end: string }

function fmt(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`
}

async function createMeetDoc(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  studentName: string,
  schedule: ClassSlot[],
  meetLink: string,
) {
  const slotLines = schedule.map(s => `${s.day} · ${fmt(s.start)} – ${fmt(s.end)}`).join('<br>')
  const footer = schedule.length > 1 ? '<p>The same link will be used for the other time as well.</p>' : ''
  const html = `<p><b>${studentName}</b></p><p>${slotLines}</p><p>Time zone: Asia/Kuala_Lumpur<br>Google Meet joining info<br>Video call link: <a href="${meetLink}">${meetLink}</a></p>${footer}`
  await drive.files.create({
    requestBody: { name: 'Google Meet Link', mimeType: 'application/vnd.google-apps.document', parents: [parentId] },
    media: { mimeType: 'text/html', body: Readable.from([html]) },
  })
}

export async function createStudentDriveFolder(
  auth: OAuth2Client,
  studentName: string,
  meetLink: string,
  classSchedule: ClassSlot[],
): Promise<string> {
  const studentsFolderId = process.env.GOOGLE_STUDENTS_FOLDER_ID
  const lecTopic1FileId = process.env.GOOGLE_LEC_TOPIC1_FILE_ID
  if (!studentsFolderId) throw new Error('GOOGLE_STUDENTS_FOLDER_ID env var is not set')
  if (!lecTopic1FileId) throw new Error('GOOGLE_LEC_TOPIC1_FILE_ID env var is not set')

  const drive = google.drive({ version: 'v3', auth })

  // Root student folder
  const rootId = await createFolder(drive, studentName, studentsFolderId)
  await drive.permissions.create({
    fileId: rootId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  try {
    // 1. Teaching Slides — shortcut to Topic_1.pptx
    const teachingId = await createFolder(drive, '1. Teaching Slides', rootId)
    await createShortcut(drive, lecTopic1FileId, teachingId, 'Topic_1.pptx')

    // 2. In-Class Coding Examples — empty ipynb
    const codingId = await createFolder(drive, '2. In-Class Coding Examples', rootId)
    await uploadIpynb(drive, `${studentName} Topic 1`, codingId)

    // 3. Homework Questions — blank Google Doc
    const hwQId = await createFolder(drive, '3. Homework Questions', rootId)
    await createBlankDoc(drive, `${studentName} Topic 1 Homework`, hwQId)

    // 4. Homework Sample Answers — empty ipynb
    const hwAnsId = await createFolder(drive, '4. Homework Sample Answers', rootId)
    await uploadIpynb(drive, `${studentName} Homework Topic 1`, hwAnsId)

    // Google Meet Link — doc with student info and meet link
    await createMeetDoc(drive, rootId, studentName, classSchedule, meetLink)
  } catch (err) {
    // Clean up root folder so a retry doesn't create duplicates
    await drive.files.delete({ fileId: rootId }).catch(() => null)
    throw err
  }

  return `https://drive.google.com/drive/folders/${rootId}`
}
