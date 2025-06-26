document.addEventListener('DOMContentLoaded', () => {
    // --- 상수 정의 ---
    const CAFFEINE_HALF_LIFE_HOURS = 0.1; // 카페인 반감기 (시간)
    const CAFFEINE_HALF_LIFE_MS = CAFFEINE_HALF_LIFE_HOURS * 60 * 60 * 1000; // ms 단위
    const UPDATE_INTERVAL_MS = 1000; // 그래프 업데이트 주기 (1초)
    const STORAGE_KEY = 'caffeineTrackerData'; // LocalStorage 키
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

    // --- 상태 변수 ---
    let currentDay = new Date().setHours(0, 0, 0, 0); // 날짜 변경 감지를 위한 변수

    // --- 데이터 저장/불러오기 함수 ---
    function saveDataToStorage(lineData, scatterData) {
        const dataToStore = {
            day: currentDay,
            linePoints: lineData,
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
                currentDay = savedData.day; // 저장된 날짜로 동기화
                return {
                    linePoints: savedData.linePoints || [],
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
    const initialData = loadDataFromStorage() || { linePoints: [], scatterPoints: [] }; // 페이지 로드 시 데이터 불러오기
    const caffeineChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '체내 카페인 (mg)',
                data: initialData.linePoints, // 불러온 데이터로 차트 초기화
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
                                label = context.raw.name;
                            } else { // 꺾은선 그래프의 툴팁
                                label = context.dataset.label || '';
                            }
                            
                            label += `: ${context.parsed.y.toFixed(1)} mg`;
                            return label;
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
        currentCaffeineLevelSpan.textContent = amount.toFixed(1);
    }

    // 기본 줌 레벨로 리셋하는 함수
    function resetZoomToDefault() {
        const lineData = caffeineChart.data.datasets[0].data;
        let centerTime;

        // 데이터가 있으면 마지막 포인트를, 없으면 현재 시간을 중심으로 설정
        if (lineData.length > 0) {
            centerTime = lineData[lineData.length - 1].x;
        } else {
            centerTime = Date.now();
        }

        // 중심 시간으로부터 1시간 범위 설정 (앞뒤로 30분씩)
        caffeineChart.options.scales.x.min = centerTime - 30 * 60 * 1000;
        caffeineChart.options.scales.x.max = centerTime + 30 * 60 * 1000;
        
        caffeineChart.update('none'); // 애니메이션 없이 업데이트
    }

    // 모든 데이터를 리셋하는 함수
    function resetAllData() {
        // 데이터 초기화
        caffeineChart.data.datasets[0].data = []; // 꺾은선 그래프 데이터
        caffeineChart.data.datasets[1].data = []; // 섭취 기록 데이터
        updateCaffeineDisplay(0); // 현재 카페인 양 0으로
        localStorage.removeItem(STORAGE_KEY); // LocalStorage 데이터 삭제

        // 차트 업데이트 및 줌 리셋
        caffeineChart.update();
        resetZoomToDefault(); // 줌 상태도 기본으로 리셋
        currentDay = new Date().setHours(0, 0, 0, 0); // 현재 날짜 상태도 오늘로 초기화
    }

    // 페이지 로드 시, 저장된 데이터가 있으면 현재 카페인 양 업데이트
    if (initialData.linePoints.length > 0) {
        updateCaffeineDisplay(initialData.linePoints[initialData.linePoints.length - 1].y);
    }

    // 카페인 섭취 버튼 클릭 시 호출되는 함수
    function addCaffeine(amount, name) {
        const now = Date.now();
        const lineData = caffeineChart.data.datasets[0].data;
        const scatterData = caffeineChart.data.datasets[1].data;
        let currentAmountAfterDecay = 0;

        if (lineData.length > 0) {
            // 마지막 포인트로부터 현재까지의 감소량을 먼저 계산하여 정확도 향상
            const lastPoint = lineData[lineData.length - 1];
            const timeElapsed = now - lastPoint.x;
            const decayFactor = Math.pow(0.5, timeElapsed / CAFFEINE_HALF_LIFE_MS);
            currentAmountAfterDecay = lastPoint.y * decayFactor;
        }

        const newAmount = currentAmountAfterDecay + amount;

        // 꺾은선 그래프에 새로운 데이터 포인트 추가 (섭취로 인한 급증)
        lineData.push({ x: now, y: newAmount });

        // 분산형 그래프에 섭취 기록 추가
        scatterData.push({ x: now, y: newAmount, name: name });
        
        updateCaffeineDisplay(newAmount);
        caffeineChart.update();
        saveDataToStorage(lineData, scatterData); // 데이터 변경 후 저장
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
        const scatterData = caffeineChart.data.datasets[1].data;

        const lastPoint = lineData[lineData.length - 1];
        const timeElapsed = now - lastPoint.x;

        if (timeElapsed > 0) {
            // 지수 함수를 이용한 반감기 공식: N(t) = N0 * (1/2)^(t/T)
            const decayFactor = Math.pow(0.5, timeElapsed / CAFFEINE_HALF_LIFE_MS);
            const newAmount = lastPoint.y * decayFactor;

            // 카페인 양이 매우 적으면 0으로 처리
            if (newAmount < 0.1) {
                lineData.push({ x: now, y: 0 });
                updateCaffeineDisplay(0);
            } else {
                lineData.push({ x: now, y: newAmount });
                updateCaffeineDisplay(newAmount);
            }

            caffeineChart.update();
            saveDataToStorage(lineData, scatterData); // 시뮬레이션 후 데이터 저장
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

    // 줌 리셋 버튼에 이벤트 리스너 추가
    resetZoomBtn.addEventListener('click', resetZoomToDefault);

    // 데이터 리셋 버튼에 이벤트 리스너 추가
    resetDataBtn.addEventListener('click', resetAllData);

    // 1초마다 카페인 감소 시뮬레이션 실행
    setInterval(simulateDecay, UPDATE_INTERVAL_MS);

    // 차트 초기 로드 시 기본 줌 레벨 설정
    resetZoomToDefault();
});