import { uid } from '../lib/format.js';

// Demo data so first-time visitors can explore the app.
const series = {
  glucose: [98, 94, 89],
  hba1c: [5.7, 5.5, 5.3],
  insulin: [11.2, 8.4, 5.9],
  total_cholesterol: [228, 205, 182],
  ldl: [148, 121, 96],
  hdl: [44, 49, 55],
  triglycerides: [180, 132, 88],
  non_hdl: [184, 156, 127],
  apob: [118, 98, 79],
  creatinine: [1.02, 0.98, 0.95],
  egfr: [88, 93, 97],
  uric_acid: [6.4, 5.9, 5.2],
  alt: [38, 29, 22],
  ast: [31, 26, 23],
  ggt: [42, 31, 21],
  tsh: [3.1, 2.6, 2.1],
  free_t4: [1.1, 1.2, 1.2],
  hemoglobin: [14.6, 15.0, 15.1],
  wbc: [7.8, 6.6, 5.4],
  platelets: [262, 248, 241],
  hscrp: [2.4, 1.3, 0.6],
  homocysteine: [12.1, 10.2, 8.3],
  vitamin_d: [21, 34, 46],
  b12: [380, 470, 560],
  ferritin: [210, 160, 120],
  sodium: [140, 141, 139],
  potassium: [4.4, 4.2, 4.5],
  chloride: [103, 102, 101],
  co2: [24, 25, 26],
  total_protein: [7.4, 7.2, 7.1],
  mch: [30.1, 30.4, 30.6],
  mchc: [33.6, 33.9, 34.0],
  rdw: [14.2, 13.4, 12.6],
  neutrophils: [5.1, 4.0, 3.1],
  lymphocytes: [2.0, 1.9, 1.7],
};
const dates = ['2024-03-12', '2025-01-20', '2025-11-04'];
const labs = ['Quest Diagnostics', 'Quest Diagnostics', 'LabCorp'];

export function sampleResults() {
  return dates.map((date, i) => ({
    id: uid(),
    importedAt: new Date().toISOString(),
    date,
    lab: labs[i],
    sample: true,
    patient: { sex: 'male', birthYear: 1986 },
    results: Object.entries(series).map(([code, vals]) => ({ code, value: vals[i] })),
  }));
}

export function sampleFriend() {
  const v = {
    glucose: 86, hba1c: 5.2, insulin: 4.8, total_cholesterol: 196, ldl: 112, hdl: 68,
    triglycerides: 72, non_hdl: 128, apob: 88, creatinine: 0.82, egfr: 102, alt: 18,
    ast: 21, ggt: 14, tsh: 1.6, hemoglobin: 13.4, wbc: 5.1, hscrp: 0.4, vitamin_d: 38,
    ferritin: 34, b12: 610, sodium: 138, potassium: 4.1, uric_acid: 4.2,
  };
  return {
    id: uid(),
    sharedBy: 'Alex',
    receivedAt: new Date().toISOString(),
    sample: true,
    result: {
      id: uid(),
      date: '2025-10-18',
      lab: 'Synlab',
      patient: { sex: 'female', birthYear: null },
      results: Object.entries(v).map(([code, value]) => ({ code, value })),
    },
  };
}
