document.addEventListener('DOMContentLoaded', () => {
    // --- 상수 정의 ---
    const DEFAULT_HALF_LIFE_HOURS = 5; // 기본 카페인 반감기 (시간)
    const UPDATE_INTERVAL_MS = 1000; // 그래프 업데이트 주기 (1초)
    const ZOOM_MODE_HOUR = 'hour';
    const ZOOM_MODE_DAY = 'day';
    const BUTTON_TEXT_HOUR_VIEW = '🗓️ 하루 기록'; // Button text to switch to day view
    const BUTTON_TEXT_DAY_VIEW = '⏱️ 1시간 기록'; // Button text to switch to hour view
    const STORAGE_KEY = 'caffeineTrackerData'; // LocalStorage 키
    const HALF_LIFE_STORAGE_KEY = 'caffeineHalfLife'; // 반감기 설정 LocalStorage 키
    const TIME_TO_CLEAR_THRESHOLD_MG = 10; // 시간 예측을 위한 카페인 임계값 (mg)
    const DRINK_COLORS = {
        '커피': 'rgba(139, 69, 19, 1)',       // Brown
        '에너지 드링크': 'rgba(255, 215, 0, 1)', // Gold
        '차': 'rgba(0, 128, 0, 1)',          // Green
        '콜라': 'rgba(220, 20, 60, 1)',       // Crimson
        '초콜렛': 'rgba(92, 64, 51, 1)',      // Dark Brown
        'default': 'rgba(128, 128, 128, 1)' // Gray
    };

    // --- DOM 요소 가져오기 ---
    const ctx = document.getElementById('caffeineChart').getContext('2d');
    const currentCaffeineLevelSpan = document.getElementById('currentCaffeineLevel');
    const controlButtons = document.querySelectorAll('#controls button[data-caffeine]');
    const resetDataBtn = document.getElementById('resetDataBtn'); // 새롭게 추가된 데이터 리셋 버튼
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const halfLifeNumberInput = document.getElementById('halfLifeNumberInput');
    const timeToClearContainer = document.getElementById('timeToClearContainer');
    const timeToClearSpan = document.getElementById('timeToClear');

    // --- 상태 변수 ---
    let currentDay = new Date().setHours(0, 0, 0, 0); // 날짜 변경 감지를 위한 변수
    let currentZoomMode = ZOOM_MODE_HOUR; // 현재 줌 모드 ('hour' 또는 'day')
    let caffeineHalfLifeHours;
    let CAFFEINE_HALF_LIFE_MS;

    // --- 데이터 저장/불러오기 함수 ---
    function saveDataToStorage(scatterData) {
        // 이제 라인 데이터는 저장하지 않음. 섭취 기록(scatter)만 저장하면 됨.
        const dataToStore = {
            day: currentDay,
            scatterPoints: scatterData
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    }

    function loadDataFromStorage() {
        const savedDataJSON = localStorage.getItem(STORAGE_KEY);
        if (!savedDataJSON) return null;

        try {
            const savedData = JSON.parse(savedDataJSON);
            const today = new Date().setHours(0, 0, 0, 0);

            // 저장된 데이터가 오늘 날짜인지 확인
            if (savedData.day === today) { 
                // 데이터 포맷 검증 (구버전 데이터 호환성 처리)
                if (savedData.scatterPoints && savedData.scatterPoints.length > 0 && savedData.scatterPoints[0].y !== undefined) {
                    console.warn('구버전 데이터 포맷이 감지되었습니다. 새 포맷을 위해 데이터를 초기화합니다.');
                    localStorage.removeItem(STORAGE_KEY);
                    return null;
                }

                currentDay = savedData.day; // 저장된 날짜로 동기화
                return {
                    scatterPoints: savedData.scatterPoints || []
                };
            } else {
                localStorage.removeItem(STORAGE_KEY); // 오래된 데이터는 삭제
                return null;
            }
        } catch (e) {
            console.error("localStorage에서 데이터를 파싱하는 중 오류 발생:", e);
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
    }

    // --- 차트(그래프) 초기화 ---
    const initialData = loadDataFromStorage() || { scatterPoints: [] }; // 페이지 로드 시 섭취 기록만 불러오기
    const caffeineChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '체내 카페인 (mg)',
                data: [], // 라인 데이터는 동적으로 생성되므로 처음엔 비워둠
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                fill: true,
                tension: 0.1, // 라인을 부드럽게
                pointRadius: 0 // 라인 위의 점은 숨김
            }, {
                label: '섭취 기록',
                data: initialData.scatterPoints,
                type: 'scatter',
                pointRadius: 6,
                pointHoverRadius: 8,
                backgroundColor: (context) => {
                    if (!context.raw) return DRINK_COLORS.default;
                    const name = context.raw.name;
                    return DRINK_COLORS[name] || DRINK_COLORS.default;
                }
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        tooltipFormat: 'HH:mm:ss',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: '시간'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '카페인 (mg)'
                    }
                }
            },
            animation: {
                duration: 0 // 실시간 업데이트 시 애니메이션 비활성화
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = '';
                            // 분산형 그래프(섭취 기록)의 툴팁
                            if (context.dataset.type === 'scatter') {
                                // 섭취량 표시로 변경
                                label = `${context.raw.name}: +${context.raw.amount.toFixed(0)} mg`;
                            } else { // 꺾은선 그래프의 툴팁
                                label = context.dataset.label || '';
                                label += `: ${context.parsed.y.toFixed(1)} mg`;
                            }
                            return label;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        thresholdLine: {
                            type: 'line',
                            scaleID: 'x',
                            value: 0, // 동적으로 업데이트될 값
                            borderColor: 'rgba(255, 99, 132, 0.8)',
                            borderWidth: 2,
                            borderDash: [6, 6],
                            display: false, // 처음에는 숨김
                            label: {
                                display: true,
                                content: '', // 동적으로 업데이트될 내용
                                position: 'start',
                                backgroundColor: 'rgba(255, 99, 132, 0.8)',
                                color: 'white',
                                font: { size: 10 },
                                padding: 4,
                                borderRadius: 4,
                            }
                        }
                    }
                }
            },
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x',
                    threshold: 5, // 5px 이상 움직여야 팬 시작
                },
                zoom: {
                    wheel: {
                        enabled: true,
                    },
                    pinch: {
                        enabled: true,
                    },
                    mode: 'x',
                }
            },
            maintainAspectRatio: false
        }
    });

    // --- 핵심 로직 ---

    // 현재 카페인 양을 화면에 업데이트하는 함수
    function updateCaffeineDisplay(amount) {
        const displayAmount = Math.max(0, amount);
        currentCaffeineLevelSpan.textContent = displayAmount.toFixed(1);
        updateEstimatedClearTime(displayAmount);
    }

    // 카페인 양이 임계값 이하로 떨어질 때까지의 예상 시간을 계산하고 표시하는 함수
    function updateEstimatedClearTime(currentAmount) {
        const thresholdAnnotation = caffeineChart.options.plugins.annotation.annotations.thresholdLine;

        if (currentAmount <= TIME_TO_CLEAR_THRESHOLD_MG) {
            timeToClearContainer.style.display = 'none'; // 임계값 이하이면 숨김
            thresholdAnnotation.display = false; // 그래프의 선도 숨김
            return;
        }

        timeToClearContainer.style.display = 'block'; // 임계값 이상이면 표시

        // 시간 계산 공식: t = T * log2(N0 / N(t))
        // t: 시간, T: 반감기, N0: 현재 농도, N(t): 목표 농도
        const timeToReachThresholdMs = CAFFEINE_HALF_LIFE_MS * Math.log2(currentAmount / TIME_TO_CLEAR_THRESHOLD_MG);

        if (timeToReachThresholdMs <= 0) {
            timeToClearContainer.style.display = 'none';
            thresholdAnnotation.display = false;
            return;
        }

        const hours = Math.floor(timeToReachThresholdMs / (1000 * 60 * 60));
        const minutes = Math.floor((timeToReachThresholdMs % (1000 * 60 * 60)) / (1000 * 60));

        let timeString = '';
        if (hours > 0) {
            timeString += `${hours}시간 `;
        }
        // 분은 항상 표시 (예: 0시간 30분)
        timeString += `${minutes}분`;

        timeToClearSpan.textContent = `약 ${timeString.trim()} 후`;

        // 그래프에 표시될 주석(선) 업데이트
        const targetTimestamp = Date.now() + timeToReachThresholdMs;
        const targetDate = new Date(targetTimestamp);
        const annotationTime = targetDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        thresholdAnnotation.value = targetTimestamp;
        thresholdAnnotation.label.content = `${annotationTime} (10mg↓)`;
        thresholdAnnotation.display = true;
    }

    // 섭취 기록(scatterData)을 기반으로 전체 카페인 곡선(lineData)을 다시 계산하는 함수
    function rebuildLineData() {
        const lineData = caffeineChart.data.datasets[0].data;
        const scatterData = caffeineChart.data.datasets[1].data;

        lineData.length = 0; // 기존 라인 데이터 초기화
        scatterData.sort((a, b) => a.x - b.x); // 시간순으로 정렬

        if (scatterData.length === 0) {
            updateCaffeineDisplay(0);
            caffeineChart.update('none');
            return;
        }

        // 특정 시간(time)의 총 카페인 양을 계산하는 헬퍼 함수
        const getTotalCaffeineAtTime = (time) => {
            return scatterData.reduce((total, intake) => {
                if (intake.x <= time) {
                    const timeElapsed = time - intake.x;
                    const decayFactor = Math.pow(0.5, timeElapsed / CAFFEINE_HALF_LIFE_MS);
                    total += intake.amount * decayFactor;
                }
                return total;
            }, 0);
        };

        // 각 섭취 시점(scatter point)의 y값을 다시 계산하여 그래프에 정확히 표시
        scatterData.forEach(point => {
            point.y = getTotalCaffeineAtTime(point.x);
        });

        // 첫 섭취부터 현재까지 5분 간격으로 라인 데이터 포인트 생성
        const firstIntakeTime = scatterData[0].x;
        const now = Date.now();
        const timeStep = 5 * 60 * 1000; // 5분

        for (let t = firstIntakeTime; t < now; t += timeStep) {
            lineData.push({ x: t, y: getTotalCaffeineAtTime(t) });
        }

        // 가장 마지막, 현재 시간의 포인트를 추가하여 곡선을 완성
        const finalAmount = getTotalCaffeineAtTime(now);
        lineData.push({ x: now, y: finalAmount });

        updateCaffeineDisplay(finalAmount);
        caffeineChart.update('none');
    }

    // 1시간 줌 레벨로 설정하는 함수
    function setHourView() {
        const now = Date.now();
        caffeineChart.options.scales.x.min = now - 30 * 60 * 1000; // 현재 시간 기준 30분 전
        caffeineChart.options.scales.x.max = now + 30 * 60 * 1000; // 현재 시간 기준 30분 후
        resetZoomBtn.textContent = BUTTON_TEXT_HOUR_VIEW; // 버튼 텍스트를 '하루 기록'으로 변경
        currentZoomMode = ZOOM_MODE_HOUR;
    }

    // 하루 전체 줌 레벨로 설정하는 함수
    function setDayView() {
        const lineData = caffeineChart.data.datasets[0].data;
        let minTime, maxTime;

        const todayStart = new Date().setHours(0, 0, 0, 0);
        const todayEnd = new Date().setHours(23, 59, 59, 999);

        if (lineData.length > 0) {
            // 첫 번째 기록 시간부터 시작하되, 오늘 날짜의 시작 시간보다 빠르지 않게
            minTime = Math.max(lineData[0].x, todayStart);
        } else {
            // 기록이 없으면 오늘 하루의 시작부터
            minTime = todayStart;
        }
        maxTime = todayEnd; // 항상 오늘 하루의 끝까지

        caffeineChart.options.scales.x.min = minTime;
        caffeineChart.options.scales.x.max = maxTime;
        resetZoomBtn.textContent = BUTTON_TEXT_DAY_VIEW; // 버튼 텍스트를 '1시간 기록'으로 변경
        currentZoomMode = ZOOM_MODE_DAY;
    }

    // 줌 레벨을 토글하는 함수
    function toggleZoomView() {
        if (currentZoomMode === ZOOM_MODE_HOUR) {
            // 현재 1시간 뷰이므로, 하루 뷰로 전환
            setDayView();
        } else {
            // 현재 하루 뷰이므로, 1시간 뷰로 전환
            setHourView();
        }
        caffeineChart.update('none'); // 애니메이션 없이 업데이트
    }

    // 모든 데이터를 리셋하는 함수
    function resetAllData() {
        // 데이터 초기화
        caffeineChart.data.datasets[0].data = []; // 꺾은선 그래프 데이터
        caffeineChart.data.datasets[1].data = []; // 섭취 기록 데이터
        updateCaffeineDisplay(0); // 현재 카페인 양 0으로
        localStorage.removeItem(STORAGE_KEY); // LocalStorage 데이터 삭제
        localStorage.removeItem(HALF_LIFE_STORAGE_KEY); // 반감기 설정도 리셋
        
        // 차트 업데이트 및 줌 리셋 (항상 1시간 뷰로 리셋)
        caffeineChart.update();
        setHourView(); // 줌 상태를 1시간 뷰로 리셋
        caffeineChart.update('none'); // Ensure chart updates after zoom reset
        currentDay = new Date().setHours(0, 0, 0, 0); // 현재 날짜 상태도 오늘로 초기화
    }

    // 카페인 섭취 버튼 클릭 시 호출되는 함수
    function addCaffeine(amount, name) {
        const now = Date.now();
        const scatterData = caffeineChart.data.datasets[1].data;

        // 새로운 데이터 구조: {시간, 섭취량, 음료이름}
        scatterData.push({ x: now, amount: amount, name: name });

        // 그래프 전체를 다시 그림
        rebuildLineData();
        
        // 변경된 섭취 기록 저장
        saveDataToStorage(scatterData);
    }

    // 주기적으로 카페인 감소를 계산하고 그래프를 업데이트하는 함수
    function simulateDecay() {
        const now = Date.now();
        const todayStartOfDay = new Date(now).setHours(0, 0, 0, 0);

        // --- 하루가 지나면 차트 리셋 ---
        // 이제 resetAllData 함수를 호출하여 중복 로직 제거
        if (todayStartOfDay > currentDay) {
            currentDay = todayStartOfDay; // 날짜를 오늘로 업데이트 (resetAllData 내부에서 currentDay를 사용하므로 먼저 업데이트)
            resetAllData(); // 모든 데이터 리셋

            caffeineChart.update();
            return; // 리셋 후에는 감소 로직을 실행하지 않음
        }

        const lineData = caffeineChart.data.datasets[0].data;
        if (lineData.length === 0) return;

        // 가장 마지막 데이터 포인트에서 시간 경과에 따른 감소량만 계산하여 추가 (효율성)
        const lastPoint = lineData[lineData.length - 1];
        const timeElapsed = now - lastPoint.x;

        if (timeElapsed > 0) {
            // 지수 함수를 이용한 반감기 공식: N(t) = N0 * (1/2)^(t/T)
            const decayFactor = Math.pow(0.5, timeElapsed / CAFFEINE_HALF_LIFE_MS);
            let newAmount = lastPoint.y * decayFactor;

            // 카페인 양이 매우 적으면 0으로 처리
            if (newAmount < 0.1) {
                newAmount = 0;
            }
            
            lineData.push({ x: now, y: newAmount });
            updateCaffeineDisplay(newAmount);

            // 성능을 위해 오래된 라인 데이터 포인트 제거
            const oneDayAgo = now - 24 * 60 * 60 * 1000;
            const firstValidIndex = lineData.findIndex(p => p.x >= oneDayAgo);
            if (firstValidIndex > 0) {
                lineData.splice(0, firstValidIndex);
            }
            caffeineChart.update('none');
        }
    }

    // --- 이벤트 리스너 및 타이머 설정 ---

    // 각 버튼에 클릭 이벤트 리스너 추가
    controlButtons.forEach(button => {
        button.addEventListener('click', () => {
            const amount = parseInt(button.dataset.caffeine, 10);
            const name = button.dataset.name;
            addCaffeine(amount, name);
        });
    });

    // 반감기 값을 설정하고 UI와 상태를 업데이트하는 통합 함수
    function setHalfLife(value) {
        // 입력값이 유효한 범위(1-12) 내에 있도록 보정
        const newHalfLife = Math.max(0.1, Math.min(24, parseFloat(value)));

        if (isNaN(newHalfLife)) return; // 유효하지 않은 숫자 입력은 무시

        // 상태 변수 업데이트
        caffeineHalfLifeHours = newHalfLife;
        CAFFEINE_HALF_LIFE_MS = caffeineHalfLifeHours * 60 * 60 * 1000;
        
        // UI 요소(숫자 입력 필드) 동기화
        halfLifeNumberInput.value = newHalfLife.toFixed(1);

        // 변경사항 저장 및 그래프 재계산
        localStorage.setItem(HALF_LIFE_STORAGE_KEY, newHalfLife);
        rebuildLineData();
        saveDataToStorage(caffeineChart.data.datasets[1].data);
    }

    // 반감기 숫자 입력 필드 이벤트 리스너 ('change'는 입력 완료 후 포커스가 벗어날 때 발생)
    halfLifeNumberInput.addEventListener('change', () => {
        setHalfLife(halfLifeNumberInput.value);
    });

    // 줌 리셋 버튼에 이벤트 리스너 추가
    resetZoomBtn.addEventListener('click', toggleZoomView);

    // 데이터 리셋 버튼에 이벤트 리스너 추가
    resetDataBtn.addEventListener('click', resetAllData);

    // --- 초기화 실행 ---

    // 저장된 반감기 값 불러오기 또는 기본값 사용
    const savedHalfLife = localStorage.getItem(HALF_LIFE_STORAGE_KEY);
    caffeineHalfLifeHours = savedHalfLife ? parseFloat(savedHalfLife) : DEFAULT_HALF_LIFE_HOURS;
    // CAFFEINE_HALF_LIFE_MS는 setHalfLife에서 설정되므로 여기서는 초기화만
    setHalfLife(caffeineHalfLifeHours); // 초기 값 설정 및 UI 동기화

    rebuildLineData(); // 불러온 섭취 기록으로 라인 그래프 생성
    setHourView(); // 차트 초기 뷰를 1시간으로 설정

    // 1초마다 카페인 감소 시뮬레이션 실행
    setInterval(simulateDecay, UPDATE_INTERVAL_MS);
});