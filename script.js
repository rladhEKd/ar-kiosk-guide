// 1. 설정: 인식할 키워드를 이곳에 추가하거나 수정하세요.
const TARGET_WORDS = ['버거', '음료', '주문', '결제'];

// ===== 주문 단계(state) & 주문 정보 =====
const STEPS = {
    IDLE: 'IDLE',                 // 아무 것도 안 하는 기본 상태
    MENU_CATEGORY: 'MENU_CATEGORY', // '버거' 탭 선택 단계
    MENU_ITEM: 'MENU_ITEM',       // '불고기버거' 같은 구체 메뉴 선택
    SET_OR_SINGLE: 'SET_OR_SINGLE', // 단품/세트 선택
    DESSERT: 'DESSERT',           // 디저트 선택
    DRINK: 'DRINK',               // 음료 선택
    CONFIRM: 'CONFIRM',           // 최종 확인
};

let currentStep = STEPS.IDLE;

const order = {
    menu: null,          // 예: '리아 불고기버거' (kiosk-ui 실제 메뉴 이름)
    menuKeyword: null,   // OCR에서 찾을 키워드 (예: '불고기')
    isSet: null,         // true=세트, false=단품, null=미정
    dessert: null,       // 예: '포테이토'
    dessertKeyword: null,// OCR에서 찾을 키워드 (예: '포테이토')
    drink: null,         // 예: '펩시콜라(R)'
    drinkKeyword: null,  // OCR에서 찾을 키워드 (예: '펩시콜라')
};

// --- 이하 코드는 가급적 수정하지 마세요. ---

// 2. HTML 요소 가져오기
const video = document.getElementById('video');
const cameraButton = document.getElementById('cameraButton');
const scanButton = document.getElementById('scanButton');
const ocrOutput = document.getElementById('ocr-output');
const arOverlay = document.getElementById('ar-overlay');

let worker;
let stream;

// 3. Tesseract.js 초기화
async function initializeTesseract() {
    ocrOutput.textContent = 'OCR 엔진을 로딩 중입니다...';
    try {
        worker = await Tesseract.createWorker('kor');
        ocrOutput.textContent = 'OCR 엔진 로딩 완료. 카메라를 켜고 스캔 버튼을 누르세요.';
    } catch (error) {
        console.error('Tesseract.js v5 초기화 실패:', error);
        ocrOutput.textContent = 'OCR 엔진 로딩에 실패했습니다. 인터넷 연결을 확인해주세요.';
    }
}
initializeTesseract();

// 4. 카메라 켜기 버튼 이벤트 리스너
cameraButton.addEventListener('click', async () => {
    if (stream) {
        // 카메라 끄기
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;
        cameraButton.textContent = '카메라 켜기';
        scanButton.style.display = 'none';
        arOverlay.innerHTML = '';
        ocrOutput.textContent = '카메라가 꺼졌습니다.';
        return;
    }

    // 카메라 켜기
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream;
            video.play();
            cameraButton.textContent = '카메라 끄기';
            scanButton.style.display = 'inline-block';
            ocrOutput.textContent = '카메라가 켜졌습니다. 화면을 맞추고 스캔 버튼을 누르세요.';
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
        }
    } else {
        alert('이 브라우저에서는 카메라 접근을 지원하지 않습니다.');
    }
});

// 5. 스캔 버튼 이벤트 리스너
scanButton.addEventListener('click', recognizeText);


// 6. 텍스트 인식 함수
async function recognizeText() {
    if (!worker) {
        alert('OCR 엔진이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    if (!stream) {
        alert('카메라가 켜져 있지 않습니다.');
        return;
    }

    ocrOutput.textContent = '텍스트를 인식 중입니다...';

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    // 1. 이미지 전처리 시작
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // 흑백 변환 (Luminosity-preserving)
        const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = avg; // red
        data[i + 1] = avg; // green
        data[i + 2] = avg; // blue
    }
    context.putImageData(imageData, 0, 0);
    // 이미지 전처리 끝

    const { data: { text, words } } = await worker.recognize(canvas);

// 이전 AR 오버레이 지우기
arOverlay.innerHTML = '';

    let matchedCount = 0;

    // 인식된 단어 위에 AR 화살표 표시
    let activeTargets = TARGET_WORDS;
    
    // 1) 카테고리 단계: '버거' 글씨만 찾기
    if (currentStep === STEPS.MENU_CATEGORY) {
        activeTargets = ['버거'];
    }
    // 2) 메뉴 아이템 단계: 짧은 키워드(불고기/치즈/새우 등)로 찾기
    else if (currentStep === STEPS.MENU_ITEM && order.menuKeyword) {
        activeTargets = [order.menuKeyword];  // '불고기', '치즈', '새우' ...
    }

    words.forEach(word => {
        const text = (word.text || '').trim();

        if (activeTargets.some(target => text.includes(target))) {
            matchedCount++;

            const div = document.createElement('div');
            div.className = 'ar-arrow';
            div.style.position = 'absolute';

            const scaleX = video.clientWidth / video.videoWidth;
            const scaleY = video.clientHeight / video.videoHeight;

            div.style.left = `${word.bbox.x0 * scaleX}px`;
            div.style.top = `${word.bbox.y0 * scaleY}px`;
            div.style.width = `${(word.bbox.x1 - word.bbox.x0) * scaleX}px`;
            div.style.height = `${(word.bbox.y1 - word.bbox.y0) * scaleY}px`;
            div.style.border = '2px solid red';
            div.title = text;

            arOverlay.appendChild(div);
        }
    });

    ocrOutput.textContent = `인식 완료: 강조된 영역 ${matchedCount}개`;
}

// 7. 음성 인식 기능
const voiceButton = document.getElementById('voiceButton');
const voiceOutput = document.getElementById('voice-output');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR'; // 언어 설정: 한국어
    recognition.continuous = false; // 연속 인식 비활성화
    recognition.interimResults = false; // 중간 결과 비활성화

    voiceButton.addEventListener('click', () => {
        if (voiceButton.textContent === '음성인식 시작') {
            try {
                recognition.start();
            } catch(e) {
                voiceOutput.textContent = '오류: 이미 인식이 진행 중입니다.';
            }
        } else {
            recognition.stop();
        }
    });

    recognition.onstart = () => {
        voiceButton.textContent = '음성인식 중...';
        voiceOutput.textContent = '말씀하세요...';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        voiceOutput.textContent = transcript;
    
        // 인식된 문장을 주문 처리 로직으로 넘김
        handleOrderIntent(transcript);
    };

    recognition.onend = () => {
        voiceButton.textContent = '음성인식 시작';
    };

    // === 주문 의도 분석 함수 ===
    function handleOrderIntent(text) {
        // 공백 제거 (예: "불고기버거 세트 하나" → "불고기버거세트하나")
        const compact = text.replace(/\s+/g, '');

        // 1) 메뉴 감지 (kiosk-ui 실제 메뉴 이름 기준)
        let detectedMenu = null;
        let detectedMenuKeyword = null;
        
        // "리아 불고기버거"
        if (compact.includes('불고기')) {
            detectedMenu = '리아 불고기버거';
            detectedMenuKeyword = '불고기';
        }
        // "한우 불고기버거"
        else if (compact.includes('한우')) {
            detectedMenu = '한우 불고기버거';
            detectedMenuKeyword = '한우'; // 또는 '불고기'로 잡아도 됨
        }
        // "클래식 치즈버거" / "더블 클래식 치즈버거"
        else if (compact.includes('더블')) {
            detectedMenu = '더블 클래식 치즈버거';
            detectedMenuKeyword = '더블';
        } else if (compact.includes('치즈')) {
            detectedMenu = '클래식 치즈버거';
            detectedMenuKeyword = '치즈';
        }
        // "새우버거"
        else if (compact.includes('새우')) {
            detectedMenu = '새우버거';
            detectedMenuKeyword = '새우';
        }
        // "데리버거"
        else if (compact.includes('데리')) {
            detectedMenu = '데리버거';
            detectedMenuKeyword = '데리';
        }
        // "핫크리스피 치킨버거"
        else if (compact.includes('핫크리스피') || compact.includes('매콤')) {
            detectedMenu = '핫크리스피 치킨버거';
            detectedMenuKeyword = '핫크리스피';
        }
        // "전주 비빔라이스버거"
        else if (compact.includes('비빔') || compact.includes('라이스')) {
            detectedMenu = '전주 비빔라이스버거';
            detectedMenuKeyword = '비빔';
        }

        // 2) 세트/단품 감지
        let detectedIsSet = null;
        if (compact.includes('세트')) detectedIsSet = true;
        else if (compact.includes('단품')) detectedIsSet = false;

            switch (currentStep) {
            // 1. 아직 주문이 시작되지 않은 상태
            case STEPS.IDLE: {
                if (detectedMenu) {
                    order.menu = detectedMenu;        // 예: '불고기버거'
                    order.menuKeyword = detectedMenuKeyword;
                    order.isSet = detectedIsSet;      // true/false/null
                    currentStep = STEPS.MENU_CATEGORY;
    
                    const typeText =
                        order.isSet === null
                            ? '(단품/세트 미정)'
                            : order.isSet
                            ? '세트'
                            : '단품';
    
                    const msg = `▶ 주문 시작: 메뉴=${order.menu}, 종류=${typeText}, 현재 단계=${currentStep}`;
                    console.log(msg);
                    voiceOutput.textContent = msg;
                } else {
                    const msg =
                        '어떤 메뉴를 주문하실지 잘 못 들었어요. "불고기버거 세트 하나"처럼 말해 주세요.';
                    console.log(msg);
                    voiceOutput.textContent = msg;
                }
                break;
            }
    
            // 2. 버거 카테고리 화면에서 "다음 화면" 대기
            case STEPS.MENU_CATEGORY: {
                // "다음", "다음 화면" 같은 말이 들어가면
                if (compact.includes('다음')) {
                    currentStep = STEPS.MENU_ITEM;
    
                    const msg = `▶ 버거 메뉴 화면으로 이동했습니다. 이제 "${order.menu}" 글자를 강조할게요. 화면을 맞추고 스캔 버튼을 눌러 주세요. (현재 단계=${currentStep})`;
                    console.log(msg);
                    voiceOutput.textContent = msg;
                } else {
                    const msg = '버거 메뉴 화면으로 넘어가셨다면 "다음 화면"이라고 말씀해 주세요.';
                    console.log(msg);
                    voiceOutput.textContent = msg;
                }
                break;
            }
    
            // 3. 그 외 단계 (아직 미구현)
            default: {
                const msg = `현재 단계(${currentStep})에 대한 음성 처리는 아직 구현되지 않았습니다.`;
                console.log(msg);
                voiceOutput.textContent = msg;
                break;
            }
        }
    }

} else {
    voiceButton.style.display = 'none';
    voiceOutput.textContent = '이 브라우저는 음성인식을 지원하지 않습니다.';
}
