const logger = require('../utils/logger');
const { db } = require('../config/database');
const docx = require('docx');
const fs = require('fs');
const path = require('path');

/**
 * DOCX Workbook Generator (Enhanced with Validation)
 * Exports only approved problems with source tracking
 */
class WorkbookGenerator {
  async generateWorkbook(gradeId, topicId, includeAnswers = false) {
    logger.info(`\nGenerating workbook for grade ${gradeId}, topic ${topicId}`);

    // Fetch metadata
    const grade = await db.one('SELECT * FROM grades WHERE id = $1', [gradeId]);
    const topic = await db.one('SELECT * FROM topics WHERE id = $1', [topicId]);
    const chapter = await db.one('SELECT * FROM chapters WHERE id = $1', [topic.chapter_id]);

    // Fetch ONLY approved problems
    const problems = await db.manyOrNone(
      `SELECT p.*, ps.source_url, ps.source_title, ps.source_domain
       FROM problems p
       LEFT JOIN problem_sources ps ON ps.problem_id = p.id
       WHERE p.status = $1 AND p.grade_id = $2 AND p.topic_id = $3
       ORDER BY p.difficulty, p.created_at`,
      ['approved', gradeId, topicId]
    );

    // Validation: No approved problems without sources
    for (const problem of problems) {
      if (!problem.source_url) {
        logger.error(`\n🔴 VALIDATION FAILED: Approved problem #${problem.id} has no source URL`);
        throw new Error(`Cannot generate workbook: approved problem without source`);
      }
    }

    if (problems.length === 0) {
      logger.warn(`No approved problems found for workbook`);
      return null;
    }

    logger.info(`✓ Found ${problems.length} approved problems`);

    // Fetch theories and formulas
    const theories = await db.manyOrNone(
      'SELECT * FROM theories WHERE topic_id = $1 ORDER BY created_at',
      [topicId]
    );

    const formulas = await db.manyOrNone(
      'SELECT * FROM formulas WHERE topic_id = $1 ORDER BY created_at',
      [topicId]
    );

    // Generate DOCX
    const doc = this.buildDocument(grade, chapter, topic, theories, formulas, problems);

    // Save to file
    const outputDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `${grade.name}_${topic.name.replace(/\s+/g, '_')}_${Date.now()}.docx`;
    const filepath = path.join(outputDir, filename);

    await docx.Packer.toFile(doc, filepath);
    logger.info(`✓ Workbook saved: ${filepath}`);

    // Record in database
    const basicCount = problems.filter(p => p.difficulty === 'basic').length;
    const advancedCount = problems.filter(p => p.difficulty === 'advanced').length;

    const workbook = await db.one(
      `INSERT INTO workbooks (grade_id, topic_id, file_path, file_name, total_problems, basic_count, advanced_count, include_sources)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        gradeId,
        topicId,
        filepath,
        filename,
        problems.length,
        basicCount,
        advancedCount,
        true
      ]
    );

    return { filepath, problems: problems.length, workbook_id: workbook.id };
  }

  buildDocument(grade, chapter, topic, theories, formulas, problems) {
    const sections = [];

    // Title
    sections.push(
      new docx.Paragraph({
        text: `TOÁN ${grade.name} — ${topic.name.toUpperCase()}`,
        heading: docx.HeadingLevel.HEADING_1,
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    );

    // Theory section
    if (theories.length > 0) {
      sections.push(
        new docx.Paragraph({
          text: 'I. LÝ THUYẾT',
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        })
      );

      for (const theory of theories) {
        sections.push(
          new docx.Paragraph({
            text: theory.name,
            heading: docx.HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 }
          })
        );
        sections.push(
          new docx.Paragraph({
            text: theory.content,
            spacing: { after: 100 }
          })
        );
      }
    }

    // Formula section
    if (formulas.length > 0) {
      sections.push(
        new docx.Paragraph({
          text: 'II. CÔNG THỨC & ĐỊNH LÝ',
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        })
      );

      for (const formula of formulas) {
        sections.push(
          new docx.Paragraph({
            text: `${formula.name}: ${formula.formula}`,
            spacing: { after: 100 }
          })
        );
        if (formula.conditions) {
          sections.push(
            new docx.Paragraph({
              text: `Điều kiện: ${formula.conditions}`,
              spacing: { after: 100 },
              indent: { left: 400 }
            })
          );
        }
      }
    }

    // Problems section
    const basicProblems = problems.filter(p => p.difficulty === 'basic');
    const advancedProblems = problems.filter(p => p.difficulty === 'advanced');

    if (basicProblems.length > 0) {
      sections.push(
        new docx.Paragraph({
          text: 'III. BÀI TẬP CƠ BẢN',
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        })
      );
      sections.push(...this.addProblems(basicProblems));
    }

    if (advancedProblems.length > 0) {
      sections.push(
        new docx.Paragraph({
          text: 'IV. BÀI TẬP NÂNG CAO',
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        })
      );
      sections.push(...this.addProblems(advancedProblems));
    }

    // Sources section
    sections.push(
      new docx.Paragraph({
        text: 'V. NGUỒN THAM KHẢO',
        heading: docx.HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 }
      })
    );

    const sources = new Set();
    problems.forEach(p => {
      if (p.source_url) {
        sources.add(`${p.source_title || p.source_domain}: ${p.source_url}`);
      }
    });

    [...sources].forEach((source, idx) => {
      sections.push(
        new docx.Paragraph({
          text: source,
          bullet: { level: 0 },
          spacing: { after: 100 }
        })
      );
    });

    return new docx.Document({
      sections: [
        {
          children: sections
        }
      ]
    });
  }

  addProblems(problems) {
    const sections = [];
    problems.forEach((problem, idx) => {
      sections.push(
        new docx.Paragraph({
          text: `Bài ${idx + 1}`,
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 }
        })
      );
      sections.push(
        new docx.Paragraph({
          text: problem.question,
          spacing: { after: 200 }
        })
      );
      sections.push(
        new docx.Paragraph({
          text: '─────────────────────────────────────',
          spacing: { after: 100 }
        })
      );
      sections.push(
        new docx.Paragraph({
          text: 'BÀI LÀM CỦA TÔI:',
          bold: true,
          spacing: { after: 300 }
        })
      );
      for (let i = 0; i < 4; i++) {
        sections.push(
          new docx.Paragraph({
            text: '...................................................................',
            spacing: { after: 100 }
          })
        );
      }
    });
    return sections;
  }
}

module.exports = WorkbookGenerator;
