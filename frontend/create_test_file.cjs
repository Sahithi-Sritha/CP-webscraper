const XLSX = require('xlsx');

const data = [
  { "Student Name": "Rahul Sharma",     "LeetCode Username": "neal_wu",       "CodeChef Username": "admin2" },
  { "Student Name": "Priya Patel",      "LeetCode Username": "uwi",           "CodeChef Username": "gennady" },
  { "Student Name": "Arjun Reddy",      "LeetCode Username": "jiangly",       "CodeChef Username": "tourist" },
  { "Student Name": "Sneha Gupta",      "LeetCode Username": "votrubac",      "CodeChef Username": "" },
  { "Student Name": "Vikram Singh",     "LeetCode Username": "lee215",        "CodeChef Username": "" },
  { "Student Name": "Ananya Iyer",      "LeetCode Username": "invalid_user_xyz_999", "CodeChef Username": "invalid_cc_abc" },
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Students");
XLSX.writeFile(wb, "test_students.xlsx");
console.log("Created test_students.xlsx with", data.length, "students");
