import moment from 'moment';
import chrono from 'chrono-node';

const R = require('ramda');

// suggestions ranges
const fixedDate = ['tomorrow', 'today'];
const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const nextUnits = ['week', 'month', 'quarter', 'year'];
const inUnits = ['days', 'weeks', 'months', 'years'];
// lookup helpers
// numbers typed as string, using only the first two letters
const stringToInt = { a: 1, an: 1, on: 1, tw: 2, th: 3, fo: 4, fi: 5, si: 6, se: 7, ei: 8, ni: 9, te: 10 };
const stringToMonth = {
  a: 'aug',
  au: 'aug',
  d: 'dc',
  de: 'dec',
  f: 'feb',
  fe: 'feb',
  j: 'jan jun jul',
  ja: 'jan',
  ju: 'jun jul',
  m: 'mar may',
  ma: 'mar may',
  n: 'nov',
  no: 'nov',
  o: 'oct',
  oc: 'oct',
  s: 'sep',
  se: 'sep',
};
let savedResults = [];

export default function parseDate({
  query = '', // this string to parsed
  parseTime = false, // wether to parseTime, default is false
  hour = 0, // default hour to apply to parsed / suggested dates
  minute = 0, // default minute to apply to parsed / suggested dates
  fallback = [], // default suggestion list, when no query (will be parsed by chrono)
  ref, // reference date for chrono to improve parsing to the right date
  options, // options for chrono, e.g. { forwardDate: true } to optimize for dats in the future (see docs)
}) {
  let q = query;
  q = (query.length < 3 && stringToMonth[query]) || query;
  let results = chrono.parse(q, ref, options);
  // handling that chrono will forget the result while typing from e.g. 'nov' ... 'november'
  if (!query.length || (!results.length && !!savedResults.length && !savedResults[0].text.includes(query))) {
    savedResults = []; // reset savedResults on empty query
  } else if (!!results.length) {
    savedResults = results;
  } else {
    results = savedResults;
  }
  const now = moment();
  const shortcut = query.split(' ')[0];

  const isThis = 'this'.substr(0, shortcut.length) === shortcut; // beginning of 'this ...'
  const isNext = 'next'.substr(0, shortcut.length) === shortcut; // beginning of 'next ...'
  const isIn = 'in'.substr(0, shortcut.length) === shortcut; // beginning of 'in ...'
  const isOn = 'on'.substr(0, shortcut.length) === shortcut; // beginning of 'on ...'
  const isNumber = Number.isInteger(Number(shortcut.trim())); // beginning with number, e.g. '6' -> '6 days'

  // used to filter suggestion ranges. will capture whatever is after the shortcut
  let what = query.split(' ')[1];

  let stage, // stage is used if 'what' identified to filter range before building suggestions
    suggestions;

  // calculate suggestions when user inputted a query, else show default
  if (query && !!query.length) {
    // if no shortcut, use defaults
    suggestions = fixedDate.filter(v => v.includes(query.split(' ')[0]));

    // if using 'this'-shortcut, and no other shortcuts are in play
    if (isThis && !isNext && !isIn && !isOn && !isNumber) {
      stage = weekdays;
      if (!!what) stage = stage.filter(v => v.includes(what));
      suggestions = suggestions.concat(stage.map(string => 'this ' + string));
    }

    // if using 'next'-shortcut, and no other shortcuts are in play
    else if (isNext && !isIn && !isOn && !isThis && !isNumber) {
      stage = weekdays.concat(nextUnits);
      if (!!what) stage = stage.filter(v => v.includes(what));
      suggestions = suggestions.concat(stage.map(string => 'next ' + string));
    }

    // if no shortcut in play, try weekdays
    else if (!isNext && !isIn && !isThis && !isNumber) {
      stage = weekdays;
      if (!!what) stage = stage.filter(v => v.includes(what));
      const strictFilter =
        (query.split(' ').filter(v => !!v.length).length <= 1 && !isOn) ||
        (query.split(' ').filter(v => !!v.length).length > 1 && isOn) ||
        !!results.length;
      stage = isOn
        ? stage
        : strictFilter
        ? stage.filter(string => string === query || string.includes(query.split(' ')[0]))
        : stage.filter(
            string => string === query || !!query.split(' ').filter(subQuery => string.includes(subQuery)).length
          );
      suggestions = suggestions.concat(stage.map(string => 'on ' + string));
    }

    // if using 'in'-shortcut, or first string is number */
    else if (!isNext && !isThis && !isOn) {
      // checks both numbers and frequently used strings that mean numbers
      const number =
        Number(query.split(' ')[0]) ||
        Number(stringToInt[query.split(' ')[0].substr(0, 2)]) ||
        (isIn && (Number(what) || (what && Number(stringToInt[what.substr(0, 2)]))));
      stage = inUnits;
      // this is a bit hacky, but it basically just replace the 'what' based on wether query starts with 'in ...'
      what = isIn ? query.split(' ')[2] : what;
      if (!!what) stage = stage.filter(v => v.includes(what));

      // if there is a valid number, we will use that
      if (!isOn) {
        suggestions = suggestions.concat(
          stage.map(string => {
            const showText = number === 1 || !number;
            const val = showText ? (string === 'hours' ? 'an' : 'a') : number;
            const unit = showText ? string.substring(0, string.length - 1) : string;
            return 'in ' + val + ' ' + unit;
          })
        );
      }
    }
  }

  // fallback value, to show when no query
  else {
    suggestions = fallback;
  }

  // if there is a result with a known time, use that – else use default
  let time = { hour, minute };
  if (!!results.length) {
    const { hour, minute } = results[0].start.knownValues;
    if (hour) time = { hour, minute };
  }

  // builds the suggestion object
  suggestions = suggestions
    .filter(v => !!v)
    .map(label => {
      const dates = chrono.parse(label);
      // if the result has a known time, use that – else use default
      let { hour, minute } = dates[0] ? dates[0].start.knownValues : {};
      // this is a hack to handle that chrono has a different understanding of what 'this' and 'next' means that I do
      // Chrono works by week number, where on tuesday in W23 'this monday' means Mon in W23 not Mon in W24
      // and where on tuesday in W23 'next monday' means Mon in W24 not Mon in W25
      let date = moment(chrono.parseDate(label + ` ${hour || time.hour}:${minute || time.minute || 0}`));
      if (date.isBefore(now) && ['this', 'on'].includes(label.split(' ')[0])) date = date.add(1, 'weeks');
      if (date.isBefore(now.clone().add(1, 'weeks')) && label.split(' ')[0] === 'next') date = date.add(1, 'weeks');
      return { label, date: date._d };
    });

  // build a stage for the actual results, before creating additional ones
  const actual = results
    // see filter under suggestions... this is hacky – i know...
    .filter(
      r =>
        !['this', 'on'].includes(r.text.split(' ')[0]) && !(r.text.includes('mon') && r.start.knownValues.weekday === 1)
    )
    .map(r => {
      const { knownValues, impliedValues } = r.start;
      const month = (knownValues.month || impliedValues.month) - 1;
      return moment({ ...knownValues, ...impliedValues, month, ...time });
    });

  // if only a single result, we will try creating more based on the known values from our chrono result
  let additional = [];
  if (actual.length === 1 && !isThis && !isNext && !isIn && !isOn && !isNumber) {
    const knownValues = Object.keys(results[0].start.knownValues);
    const hasWeekday = knownValues.includes('weekday');
    const hasMonth = knownValues.includes('month');
    const hasDay = knownValues.includes('day');
    const hasYear = knownValues.includes('year');
    const hasTime = knownValues.includes('hour');
    if (!(hasYear && hasMonth && hasDay)) {
      if (hasTime || !parseTime) additional = [];
      else {
        // chosen interval based on what we know from chrono
        const interval = hasTime
          ? 'hours'
          : hasWeekday
          ? 'weeks'
          : hasMonth && hasDay
          ? parseTime
            ? 'hours'
            : 'years'
          : 'days';
        // creates two additional results adding 1 and 2 units to the chosen interval
        additional = [1, 2].map(i => {
          return actual[0].clone().add(i, interval);
        });
      }
    }
  }
  // builds the result object
  results = actual.concat(additional).map(date => {
    const isThisYear = now.isSame(date, 'year') && now.isBefore(date);
    return { label: 'on ' + date.format('MMMM Do' + (!isThisYear ? ' YYYY' : '')), date: date._d };
  });

  // merges the suggestions with the results, to make sure no date is shown twice
  // prioritise the suggestions, because it has better labelling
  suggestions = R.sortBy(R.prop('date'))(R.uniqBy(R.prop('date'))([].concat(results, suggestions)));

  return suggestions;
}
