// supabase/functions/science-visual-generation/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// إعدادات الـ CORS للسماح لتطبيقك بالاتصال بالوظيفة السحابية
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // التعامل مع طلبات الـ CORS المبدئية
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { scenarioContext, visualType, subject } = await req.json()

    // 1. هندسة التوجيه (Prompt Engineering) الخاص بالرسوميات العلمية الدقيقة
    const systemPrompt = `
      أنت مبرمج ورسام علمي خبير تعمل لدى مطبعة امتحانات كامبريدج (Cambridge Assessment).
      مهمتك هي رسم شكل علمي دقيق لمادة ${subject} يطابق السياق التالي: "${scenarioContext}".
      
      نوع الرسم المطلوب: ${visualType} (مثال: CIRCUIT, GRAPH, TABLE, APPARATUS).

      القواعد الصارمة:
      1. لا تقم بتوليد أي نص شرح، أريد الكود البرمجي للرسم فقط!
      2. إذا كان الرسم البياني (GRAPH) أو جدول (TABLE): استخدم لغة Mermaid.js.
      3. إذا كان الرسم لدائرة كهربائية (CIRCUIT) أو خلية أحياء أو أدوات مختبر (APPARATUS): استخدم كود <svg> نقي، واستخدم ألوان الأسود والأبيض فقط (لتبدو كأنها مطبوعة في ورقة امتحان).
      4. أضف المحاور بوضوح (X و Y) مع وحدات القياس الصحيحة (مثال: Time (s)).
      
      قم بإرجاع النتيجة بصيغة JSON تحتوي على:
      {
        "format": "SVG" أو "MERMAID",
        "renderCode": "الكود هنا"
      }
    `;

    // 2. إرسال الطلب إلى نموذج الذكاء الاصطناعي (هنا نستخدم Gemini Pro كمثال لأنه الأفضل في الأكواد)
    // في بيئتك الحقيقية، ستقوم باستدعاء مكتبة الذكاء الاصطناعي التي تستخدمها (Google Generative AI أو OpenAI)
    
    /* 
      -- الجزء الخاص بالاتصال الفعلي بالـ API --
      const response = await aiClient.generate({ prompt: systemPrompt });
      const visualData = JSON.parse(response.text);
    */

    // للتوضيح في هذا الكود، سنفترض أننا استلمنا الكود الناجح من الـ API
    // سنقوم بإرسال استجابة وهمية (Mock) توضح كيف سيبدو شكل الدائرة الكهربائية
    const generatedVisual = {
      format: "SVG",
      renderCode: `<svg width="300" height="200" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        <!-- رسمة مبسطة لدائرة كهربائية بأسلوب كامبريدج -->
        <rect x="50" y="50" width="200" height="100" fill="none" stroke="black" stroke-width="2"/>
        <circle cx="50" cy="100" r="15" fill="white" stroke="black" stroke-width="2"/> <!-- أميتر -->
        <text x="44" y="105" font-family="Arial" font-size="16">A</text>
        <path d="M 130 50 L 140 30 L 150 70 L 160 30 L 170 50" fill="none" stroke="black" stroke-width="2"/> <!-- مقاومة -->
        <line x1="120" y1="150" x2="120" y2="130" stroke="black" stroke-width="2"/> <!-- بطارية -->
        <line x1="140" y1="160" x2="140" y2="120" stroke="black" stroke-width="4"/>
        <text x="125" y="180" font-family="Arial" font-size="14">12V</text>
      </svg>`
    };

    // 3. إرجاع الكود للواجهة الأمامية لتقوم برسمه للطلبة
    return new Response(JSON.stringify(generatedVisual), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
