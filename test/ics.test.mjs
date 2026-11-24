import { parseICS, expandEvents } from '../lib/ics.js';
import assert from 'node:assert/strict';
const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a
DTSTART:20270106T050000Z
DTEND:20270106T053000Z
SUMMARY:피부과
END:VEVENT
BEGIN:VEVENT
UID:b
DTSTART;TZID=Asia/Seoul:20270104T044000
DTEND;TZID=Asia/Seoul:20270104T044000
SUMMARY:기상
END:VEVENT
BEGIN:VEVENT
UID:c
DTSTART;VALUE=DATE:20270120
DTEND;VALUE=DATE:20270123
SUMMARY:가족 여행
END:VEVENT
BEGIN:VEVENT
UID:d
DTSTART;TZID=Asia/Seoul:20261228T080000
DTEND;TZID=Asia/Seoul:20261228T090000
RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=6
EXDATE;TZID=Asia/Seoul:20270107T080000
SUMMARY:운동
END:VEVENT
BEGIN:VEVENT
UID:d
RECURRENCE-ID;TZID=Asia/Seoul:20270111T080000
DTSTART;TZID=Asia/Seoul:20270111T100000
DTEND;TZID=Asia/Seoul:20270111T110000
SUMMARY:운동(늦게)
END:VEVENT
BEGIN:VEVENT
UID:e
DTSTART;VALUE=DATE:20270115
RRULE:FREQ=MONTHLY;BYDAY=3FR
SUMMARY:셋째 금요일
END:VEVENT
BEGIN:VEVENT
UID:f
DTSTART;TZID=Asia/Seoul:20270105T100000
DTEND;TZID=Asia/Seoul:20270105T103000
STATUS:CANCELLED
SUMMARY:취소됨
END:VEVENT
END:VCALENDAR`.replace(/\n/g,'\r\n');
const out = expandEvents(parseICS(ics), '2027-01-01', '2027-02-01');
for (const e of out) console.log(e.date, e.start||'종일', e.end||'', e.title);
const t = (d,title)=>out.some(e=>e.date===d&&e.title===title);
assert(t('2027-01-06','피부과') && out.find(e=>e.title==='피부과').start==='14:00');
assert(t('2027-01-04','기상'));
assert(t('2027-01-20','가족 여행')&&t('2027-01-22','가족 여행')&&!t('2027-01-23','가족 여행'));
assert(t('2027-01-04','운동') && !t('2027-01-07','운동') && t('2027-01-11','운동(늦게)') && !out.some(e=>e.date==='2027-01-11'&&e.title==='운동'));
assert(!t('2027-01-18','운동')); // COUNT=6: 12/28,12/31,1/4,1/7(ex),1/11(over),1/14
assert(t('2027-01-14','운동'));
assert(t('2027-01-15','셋째 금요일'));
assert(!out.some(e=>e.title==='취소됨'));
console.log('OK', out.length);
