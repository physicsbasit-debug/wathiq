// src/ui.ts

import { AssessmentScenario, SubQuestion, ScientificVisual } from './assessment-engine/contracts';

export class ExamRenderer {
  private container: HTMLElement;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found in index.html`);
    this.container = el;
  }

  // 1. الدالة الرئيسية لرسم الاختبار الكامل
  public renderExam(scenarios: AssessmentScenario[]) {
    this.container.innerHTML = ''; // تنظيف شاشة العرض
    
    scenarios.forEach((scenario, index) => {
      const scenarioEl = document.createElement('div');
      scenarioEl.className = 'exam-scenario cambridge-style-box';
      scenarioEl.style.borderBottom = '2px solid #000';
      scenarioEl.style.paddingBottom = '30px';
      scenarioEl.style.marginBottom = '30px';
      
      // أ. رسم السياق (القصة العلمية المعطاة)
      const contextEl = document.createElement('p');
      contextEl.className = 'scenario-context';
      contextEl.style.fontSize = '1.1em';
      contextEl.innerHTML = `<strong>Question ${index + 1}:</strong> ${scenario.contextText}`;
      scenarioEl.appendChild(contextEl);

      // ب. رسم الرسوميات العلمية بدقة فائقة (Vector Graphics)
      if (scenario.visualRequirement) {
        const visualEl = this.renderVisual(scenario.visualRequirement);
        scenarioEl.appendChild(visualEl);
      }

      // ج. رسم الفروع (a, b, c) التابعة للسيناريو
      const subQuestionsContainer = document.createElement('div');
      subQuestionsContainer.className = 'sub-questions-container';
      subQuestionsContainer.style.paddingLeft = '20px'; // إزاحة للداخل لتبدو كفروع
      
      scenario.subQuestions.forEach((sq) => {
        const sqEl = this.renderSubQuestion(sq);
        subQuestionsContainer.appendChild(sqEl);
      });
      
      scenarioEl.appendChild(subQuestionsContainer);
      this.container.appendChild(scenarioEl);
    });
  }

  // 2. دالة السحر: تحويل الكود إلى رسمة علمية
  private renderVisual(visual: ScientificVisual): HTMLElement {
    const visualContainer = document.createElement('div');
    visualContainer.className = 'scientific-visual-container';
    visualContainer.style.textAlign = 'center';
    visualContainer.style.margin = '20px 0';

    if (visual.format === 'SVG') {
      // حقن كود SVG مباشرة ليتم رسمه بدقة المتجهات (لا يفقد جودته أبداً)
      visualContainer.innerHTML = visual.renderCode;
    } else if (visual.format === 'MERMAID') {
      // إضافة كلاس لكي تتعرف عليه مكتبة Mermaid.js التي سنستخدمها
      visualContainer.className += ' mermaid';
      visualContainer.innerHTML = visual.renderCode;
    }

    return visualContainer;
  }

  // 3. دالة رسم السؤال الفرعي حسب القواعد العمانية وكامبريدج
  private renderSubQuestion(sq: SubQuestion): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'sub-question';
    wrapper.style.marginBottom = '25px';

    // نص السؤال الفرعي (مع وضع الدرجة بين قوسين مربعين على الطرف، ستايل كامبريدج)
    const qText = document.createElement('p');
    qText.innerHTML = `<strong>(${sq.label})</strong> ${sq.commandVerb} ${sq.content} <span style="float:inline-end; font-weight:bold;">[${sq.marks}]</span>`;
    wrapper.appendChild(qText);

    // إذا كان سؤال اختيار من متعدد (MCQ) - حسب الوثيقة العمانية 4 خيارات
    if (sq.itemType === 'MULTIPLE_CHOICE' && sq.options) {
      const optionsList = document.createElement('ul');
      optionsList.style.listStyleType = 'none';
      optionsList.style.padding = '0';
      
      sq.options.forEach((opt, idx) => {
        const li = document.createElement('li');
        li.style.marginBottom = '8px';
        const letter = String.fromCharCode(65 + idx); // توليد A, B, C, D
        li.innerHTML = `<label style="cursor:pointer;"><input type="radio" name="q_${sq.id}" value="${opt}"> <strong>${letter}</strong>. ${opt}</label>`;
        optionsList.appendChild(li);
      });
      wrapper.appendChild(optionsList);
    } else {
      // إذا كان سؤالاً مقالياً: رسم خطوط فارغة للإجابة تناسب الدرجة المخصصة
      const answerSpace = document.createElement('div');
      answerSpace.className = 'answer-lines';
      
      // تخصيص خطين فارغين لكل درجة واحدة (حسب مساحة الإجابة المتوقعة)
      const linesCount = sq.marks * 2; 
      for (let i = 0; i < linesCount; i++) {
        const line = document.createElement('hr');
        line.style.border = 'none';
        line.style.borderBottom = '1px dotted #999';
        line.style.marginTop = '30px';
        answerSpace.appendChild(line);
      }
      wrapper.appendChild(answerSpace);
    }

    return wrapper;
  }
}
