# Fraud label worksheet

80 postings, drawn 2026-09-22. Half are cases where the current
scoring and the composer disagree; half are a random draw. Which is which is not shown, and
neither is any existing score, on purpose.

For each posting write **low**, **medium**, or **high** on the `label:` line, and a short
reason. Use `unsure` freely: an honest unsure is worth more than a guess, and the scoring
work can route those to a second look rather than pretending they were decided.

- **low** you would let a friend apply without a warning
- **medium** worth a second look before applying, something is off
- **high** you would tell someone not to apply

---

## 1. Sales Coordinator

```
label:   low
reason:  Marriott verified, applies through their own Oracle recruiting site, nothing
         asked of the applicant. Posting body has no duties at all, but that is WorkBC
         stub-listing behaviour, not a warning sign. Note: apply host reads as
         atsProvider "unknown" because the registry has Taleo but not Oracle Fusion.
```

- **Employer:** Marriott
- **Location:** Victoria, British Columbia   **Pay:** $60,507 annually
- **Apply:** https://ejwl.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/MI_CS_1/job/26094038 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Marriott verified; 'Guest Experience Expert' is its standard title and Marriott-brand hotels (e.g., Delta Ocean Pointe) operate in Victoria. Apply link is an Oracle HCM tenant, typical for franchise-managed properties.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms7xelafm7ybcb4d3r1qykl8

<details><summary>Posting text</summary>

Occupation (NOC): Technical sales specialists - wholesale trade (62100)
Location: Victoria, British Columbia
Salary: $60,507 annually
Hours: Full-time
How to apply:
Online: https://ejwl.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/MI_CS_1/job/26094038

</details>

---

## 2. food service supervisor

```
label:  medium
reason:  everything checks out. pay is roughly expected. medium because generic email provided
could be anyone impersonating burger king just to get the job id listing
```

- **Employer:** Burger King
- **Location:** Maple Ridge, BC   **Pay:** $21.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - 910 Government St, Victoria V8W 1Y3 is a verified operating Burger King restaurant in downtown Victoria, present on Yelp, Yellow Pages, DoorDash and Uber Eats with published hours and phone. The application address is the restaurant itself.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50200467

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Maple Ridge, BC
Salary: $21.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Fast food outlet or concession, Relocation costs covered by employer, Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Ensure that food and service meet quality control standards, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Establish work schedules
Supervision: 3-4 people, Food service counter attendants and food preparers
Work conditions and physical capabilities: Fast-paced environment, Standing for extended periods
Personal suitability: Efficient interpersonal skills, Team player
Employment terms options: Early morning
Experience: 7 months to less than 1 year
Employment terms options: Evening, Shift, Morning, Night, Day, Weekend
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: burgerking6811@gmail.com

</details>

---

## 3. baker

```
label: medium
reason:  posting checks out. generic email means anyone can be pretending to
be from tim hortons to have a job id present in the system. how do we know this is actually tim hortons?
```

- **Employer:** Tim Hortons
- **Location:** Penticton, BC   **Pay:** $20.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49376030

<details><summary>Posting text</summary>

Occupation (NOC): Bakers (63202)
Location: Penticton, BC
Salary: $20.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Bake shop, Café
Tasks: Requisition or order materials, equipment and supplies, Train staff in preparation, cooking and handling of food, Prepare special orders, Supervise baking personnel and kitchen staff, Frost and decorate cakes and baked goods, Draw up production schedules, Train staff, Ensure that the quality of products meets established standards, Inspect kitchen and food service areas, Operate machinery, Organize and maintain inventory, Oversee sales and merchandising of baked goods
Supervision: 1 to 2 people
Food specialties: Breads and rolls, Desserts and pastries, Donuts and muffins
Work conditions and physical capabilities: Ability to distinguish between colours, Attention to detail, Fast-paced environment, Hand-eye co-ordination, Handling heavy loads, Manual dexterity, Physically demanding, Repetitive tasks, Standing for extended periods, Tight deadlines, Work under pressure
Personal suitability: Accurate, Client focus, Dependability, Excellent oral communication, Excellent written communication, Judgement, Reliability, Team player
Screening questions: Are you authorized to work in Canada?
Employment terms options: Early morning, Evening
Experience: 1 year to less than 2 years
Employment terms options: Shift, Morning, Night, Day, Weekend
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides visual accessibility accommodations (for example: braille, screen readers, etc.), Provides auditory accessibility accommodations (for example: transcription software, teletypewriters, etc.), Participates in a government or community program or initiative that supports persons with disabilities , Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Participates in a governme

</details>

---

## 4. construction helper

```
label:  high
reason: a lot of red flags. physical mail for resume. physical mail address goes to a residential property. no company email. megacity company seems to be made up company.  
```

- **Employer:** Megacity Construction Ltd.
- **Location:** Langford, BC   **Pay:** $25.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business mismatch, location uncertain, jobs page unknown, mailing address none
  - No official website found for "Megacity Construction Ltd" in Victoria, BC after multiple targeted searches. Similar company names exist (Megacity General Construction in Philippines, Victoria Construction Ltd in BC, Megacity Paving in Ontario), but no match for this exact company name in the claimed location. Red flag: company appears not to exist.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49611628

<details><summary>Posting text</summary>

Occupation (NOC): Construction trades helpers and labourers (75110)
Location: Langford, BC
Salary: $25.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Tasks: Load, unload and transport construction materials, Mix, pour and spread materials such as concrete and asphalt, Assist in demolishing buildings, Clean and pile salvaged materials, Perform routine maintenance work, Clean up chemical spills and other contaminants, Remove rubble and other debris at construction sites
Experience: 1 to less than 7 months
Employment terms options: Day
Support for persons with disabilities: Provides awareness training to employees to create a welcoming work environment for persons with disabilities
Support for newcomers and refugees: Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees 
Support for youths: Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Provides awareness training to employees to create a welcoming work environment for Veterans 
Support for Indigenous people: Provides cultural competency training and/or awareness training to all employees to create a welcoming work environment for Indigenous workers 
Support for mature workers: Provides staff with awareness training to create a welcoming work environment for mature workers  
Supports for visible minorities: Provides diversity and cross-cultural training to create a welcoming work environment for members of visible minorities
How to apply:
By email: megacityconstructionltd@gmail.com
By mail: 3444 Caldera Ct, Langford, British Columbia, V9B 6Z8

</details>

---

## 5. artificial intelligence (ai) software engineer

```
label: medium   
reason: everything checks out but this is a software company and the only way to apply is send a physical resume.
```

- **Employer:** Geoswift
- **Location:** Vancouver, BC   **Pay:** $58.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - Geoswift is a real Vancouver-headquartered cross-border payments company (est. 2010, licensed in US/UK/China). The posting's mail address, 700 W Pender St Unit 1201, matches Geoswift Technology Limited's registered Vancouver business address, but HR contact is a Gmail account.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49943889

<details><summary>Posting text</summary>

Occupation (NOC): Software engineers and designers (21231)
Location: Vancouver, BC
Salary: $58.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Bachelor's degree, Artificial intelligence, Computer science, Computer software engineering
Work setting: Financial technology
Tasks: Collect and document user's requirements, Coordinate the development, installation, integration and operation of computer-based systems, Define system functionality, Develop flowcharts, layouts and documentation to identify solutions, Develop process and network models to optimize architecture, Develop software solutions by studying systems flow, data usage and work processes, Evaluate the performance and reliability of system designs, Evaluate user feedback, Execute full lifecycle software development, Plan every step of the integration of a computer-based system, Prepare plan to maintain software, Synthesize technical information for every phase of the cycle of a computer-based system, Upgrade and maintain software, Lead and co-ordinate teams of information systems professionals in the development of software and integrated information systems, process control software and other embedded software control systems, Robotic process automation, Usability testing, Consult with clients after sale to provide ongoing support, Conduct tests and perform security and quality controls, Implement data, software and hardware security procedures
Certificates, licences, memberships, and courses : Microsoft SQL Certification, Microsoft certified IT professional (MCITP), Microsoft certified professional (MCP), Microsoft certified solutions associate (MCSA), Microsoft certified technology specialist (MCTS)
Computer and technology knowledge: Agile, Business intelligence, Java, JavaScript, CSS, SQL, Amazon Web Services (AWS), Git, Python, MS SQL Server, MySQL, Monitoring and tracking software, Conduct software testing
Area of specialization: System integration, Development, Testing, E-commerce
Security and safety: Criminal record check
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines
Screening questions: Do you have experience working in this field?, Do you have the required certifications listed in the job posting?
Experience: 2 years to less than 3 years
Employment terms options: Day
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networki

</details>

---

## 6. Nuclear Medicine PET CT Technologist P2A

```
label: low
reason: all the things match and its a known ats provider.  
```

- **Employer:** Providence Healthcare
- **Location:** Vancouver, British Columbia   **Pay:** $89,939 - $112,340 annually
- **Apply:** https://careers-phc.icims.com/jobs/64549/nuclear-medicine-pet-ct-technologist-p2a/job (icims)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Providence Healthcare is a legitimate, substantial Canadian healthcare organization. Official website (providencehealthcare.org) is reachable and confirms it's a major faith-based health provider operating 18 locations across the Lower Mainland in Vancouver, BC. Headquarters in Vancouver matches claimed location. Site has dedicated careers section (providencehealthcare.org/en/explore-careers). Posting directs applicants to online portal (careers-phc.icims.com) with no mailing address given. Company is real, well-established (130+ years), and plausibly employs data analysts.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmt3gwycr1hsrils7o1qlv2bc

<details><summary>Posting text</summary>

Occupation (NOC): Medical radiation technologists (32121)
Location: Vancouver, British Columbia
Salary: $89,939 - $112,340 annually
Hours: Part-time
How to apply:
Online: https://careers-phc.icims.com/jobs/64549/nuclear-medicine-pet-ct-technologist-p2a/job

</details>

---

## 7. cook

```
label: low   
reason: everything checks out and they use business email address.
```

- **Employer:** Browns Crafthouse Vic West
- **Location:** Victoria, BC   **Pay:** $21.18 to $23.00 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Browns Crafthouse Vic West (100-184 Wilson St, Victoria) is a verified venue of the Browns Socialhouse restaurant group with a live location page. Application email is on the parent company's domain. Standard sous-chef posting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49232647

<details><summary>Posting text</summary>

Occupation (NOC): Cooks (63200)
Location: Victoria, BC
Salary: $21.18 to $23.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Tasks: Prepare and cook complete meals or individual dishes and foods, Order supplies and equipment, Maintain inventory and records of food, supplies and equipment, Clean kitchen and work areas
Government programs: Recognized employer
Experience: 7 months to less than 1 year
How to apply:
By email: nwilson@brownssocialhouse.com

</details>

---

## 8. Clinical Support Clerk and Clerk IVs - Various Sites

```
label: low
reason: real business. they use ats. the ats matches the company.
```

- **Employer:** Providence Healthcare
- **Location:** Vancouver, British Columbia   **Pay:** $59,779 annually
- **Apply:** https://careers-phc.icims.com/jobs/59907/clinical-support-clerk-and-clerk-ivs---various-sites/job (icims)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Providence Healthcare is a legitimate, substantial Canadian healthcare organization. Official website (providencehealthcare.org) is reachable and confirms it's a major faith-based health provider operating 18 locations across the Lower Mainland in Vancouver, BC. Headquarters in Vancouver matches claimed location. Site has dedicated careers section (providencehealthcare.org/en/explore-careers). Posting directs applicants to online portal (careers-phc.icims.com) with no mailing address given. Company is real, well-established (130+ years), and plausibly employs data analysts.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmlpwu3eww8z7jnue6lbxx421

<details><summary>Posting text</summary>

Occupation (NOC): Registered nurses and registered psychiatric nurses (31301)
Location: Vancouver, British Columbia
Salary: $59,779 annually
How to apply:
Online: https://careers-phc.icims.com/jobs/59907/clinical-support-clerk-and-clerk-ivs---various-sites/job

</details>

---

## 9. food service supervisor

```
label: medium   
reason: everything matches. medium because they use gmail.
```

- **Employer:** Tim Hortons
- **Location:** Squamish, BC   **Pay:** $20.45 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50145320

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Squamish, BC
Salary: $20.45 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Food service establishment, Coffee shop, On-site customer service, Fast food outlet or concession, Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Hire food service staff, Ensure that food and service meet quality control standards, Prepare budget and cost estimates, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Establish work schedules
Supervision: Food service counter attendants and food preparers, 16-20 people
Security and safety: Bondable
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Combination of sitting, standing, walking, Standing for extended periods, Bending, crouching, kneeling, Walking, Physically demanding
Personal suitability: Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Team player
Employment terms options: Early morning
Government programs: Recognized employer
Employment terms options: Evening
Experience: 1 year to less than 2 years
Employment terms options: Shift, Morning, Night, Day, Weekend
Support for newcomers and refugees: Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) 
Support for youths: Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: tims.squamish@gmail.com
In person: 38930 Progress Way, Squamish, British Columbia, V8B 0K5

</details>

---

## 10. Customer Service Representative

```
label: low 
reason: legit company. own company jobsite. 
```

- **Employer:** FortisBC
- **Location:** Trail, British Columbia   **Pay:** $35,630 annually
- **Apply:** https://careers.fortisbc.com/job/Trail-Customer-Service-Representative-BC/605403117/ (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - FortisBC is BC's major gas/electric utility; its official careers site lists the same Kelowna Engineering Co-op, Transmission Lines role among several co-op postings with matching hourly rates. Apply link is on the company's own domain.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmt21annq1m9n3jhtkoeekldi

<details><summary>Posting text</summary>

Occupation (NOC): Other customer and information services representatives (64409)
Location: Trail, British Columbia
Salary: $35,630 annually
Hours: Part-time
How to apply:
Online: https://careers.fortisbc.com/job/Trail-Customer-Service-Representative-BC/605403117/

</details>

---

## 11. Appointment Coordinator-OpenRoad Subaru Boundary

```
label: low
reason:  everything matches and they have their own job posting that is for them.
```

- **Employer:** OpenRoad Auto Group
- **Location:** Vancouver, British Columbia   **Pay:** $40,000 - $60,000 annually
- **Apply:** https://orag.bamboohr.com/careers/4896 (bamboohr)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - OpenRoad Auto Group is a legitimate, substantive Canadian automotive retailer with headquarters at 5978 Collection Dr, Langley, BC. The company operates 34+ dealerships across Canada representing 21 brands. Official website is openroadautogroup.com. Jaguar Land Rover Langley is confirmed as a real dealership location. The posting directs applicants to apply online via BambooHR (no mailing address given). Company has active careers page at openroadautogroup.com/careers-openroad. Location matches perfectly.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmra9gm3m3jw5g2gd4fr347ht

<details><summary>Posting text</summary>

Occupation (NOC): Receptionists (14101)
Location: Vancouver, British Columbia
Salary: $40,000 - $60,000 annually
Hours: Full-time
How to apply:
Online: https://orag.bamboohr.com/careers/4896

</details>

---

## 12. Advanced Data Analyst - EA Sports FC Live

```
label: low
reason:  legit with their own job postings.
```

- **Employer:** Electronic Arts
- **Location:** Vancouver, British Columbia   **Pay:** $114,300 - $156,200 annually
- **Apply:** https://jobs.ea.com/en_US/careers/JobDetail/Advanced-Analyst/214116 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Electronic Arts is a global video game publisher with a major Vancouver-area studio producing EA SPORTS FC. The posting applies through EA's own jobs.ea.com careers portal. Role, franchise, location and salary band are all internally consistent.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmpesdnlw98dn1s83t9hmfw7v

<details><summary>Posting text</summary>

Occupation (NOC): Data scientists (21211)
Location: Vancouver, British Columbia
Salary: $114,300 - $156,200 annually
Hours: Full-time
How to apply:
Online: https://jobs.ea.com/en_US/careers/JobDetail/Advanced-Analyst/214116

</details>

---

## 13. Registered Respiratory Therapist

```
label: low   
reason: company is real. they have their won job portal as well.
```

- **Employer:** Island Health
- **Location:** Nanaimo, British Columbia   **Pay:** $83,595 - $104,416 annually
- **Apply:** https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/231451 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Island Health / Vancouver Island Health Authority, headquartered in Victoria BC, delivers hospital, community and mental health services island-wide. Careers portal careers.islandhealth.ca; applications via its own HRSmart tenant. No mailing address requested.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmr117y8c456210b4o4ogeccn

<details><summary>Posting text</summary>

Occupation (NOC): Respiratory therapists, clinical perfusionists and cardiopulmonary technologists (32103)
Location: Nanaimo, British Columbia
Salary: $83,595 - $104,416 annually
Hours: Part-time
How to apply:
Online: https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/231451

</details>

---

## 14. Environmental Service Attendant 1

```
label:   
reason:  
```

- **Employer:** Sodexo Canada Ltd
- **Location:** Prince George, British Columbia   **Pay:** $42,016 annually
- **Apply:** https://jobs.smartrecruiters.com/SodexoCanadaLtd/744000141799589-environmental-service-attendant-1- (smartrecruiters)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location uncertain, jobs page unknown, mailing address none
  - Presumed legitimate without web search: all postings apply via the company's own matching smartrecruiters tenant.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmsgp9oho49gmwbxkp99avhtg

<details><summary>Posting text</summary>

Occupation (NOC): Light duty cleaners (65310)
Location: Prince George, British Columbia
Salary: $42,016 annually
Hours: Full-time
How to apply:
Online: https://jobs.smartrecruiters.com/SodexoCanadaLtd/744000141799589-environmental-service-attendant-1-

</details>

---

## 15. Project Manager

```
label: low
reason:  remote job, has a jobs listing page.
```

- **Employer:** TJM Labs
- **Location:** Vancouver, British Columbia   **Pay:** $95,000 - $105,000 annually
- **Apply:** https://jobs.workable.com/view/puEdoJ21DA3YL1e8V8zqSL/remote-project-manager-in-vancouver-at-tjm-labs (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location mismatch, jobs page yes, mailing address none
  - TJM Labs is a real, substantive AI-powered pharmacy automation company with an active website, careers page, and legitimate business operations. However, the company is headquartered in Wilmington, Delaware (per PitchBook), not Vancouver, BC. The posting claims Vancouver location but the company's actual headquarters is in the US. The application directs to Workable (online only, no mailing address given).
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmp8sceay4y6xasztngulcles

<details><summary>Posting text</summary>

Occupation (NOC): Civil engineers (21300)
Location: Vancouver, British Columbia
Salary: $95,000 - $105,000 annually
Hours: Full-time
How to apply:
Online: https://jobs.workable.com/view/puEdoJ21DA3YL1e8V8zqSL/remote-project-manager-in-vancouver-at-tjm-labs

</details>

---

## 16. Development Director - EA SPORTS UFC

```
label: low
reason:  reputable company with jobs protal.
```

- **Employer:** Electronic Arts
- **Location:** Vancouver, British Columbia   **Pay:** $141,400 - $204,400 annually
- **Apply:** https://jobs.ea.com/en_US/careers/JobDetail/Development-Director-UFC/215380 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Electronic Arts is a global video game publisher with a major Vancouver-area studio producing EA SPORTS FC. The posting applies through EA's own jobs.ea.com careers portal. Role, franchise, location and salary band are all internally consistent.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms50ydxt25cavfczy4culwv0

<details><summary>Posting text</summary>

Occupation (NOC): Business development officers and market researchers and analysts (41402)
Location: Vancouver, British Columbia
Salary: $141,400 - $204,400 annually
How to apply:
Online: https://jobs.ea.com/en_US/careers/JobDetail/Development-Director-UFC/215380

</details>

---

## 17. administrative assistant

```
label:  medium
reason: generic email, no clear company website
```

- **Employer:** S LINK LOGISTICS INC
- **Location:** Surrey, BC   **Pay:** $37.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location uncertain, jobs page unknown, mailing address none
  - Real trucking carrier: S Link Logistics Inc holds USDOT 4253801 (FMCSA data via loadconnect.io) and a City of Surrey business licence at 17921 98 Ave (trucking & cartage). No website found; hotmail application address. Posting claims Nanaimo but the company is registered in Surrey with no Nanaimo footprint found; driver jobs can be remote-based, so location uncertain.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49981183

<details><summary>Posting text</summary>

Occupation (NOC): Administrative assistants (13110)
Location: Surrey, BC
Salary: $37.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: College, CEGEP or other non-university certificate or diploma from a program of 1 year to 2 years
Tasks: Schedule and confirm appointments, Answer telephone and relay telephone calls and messages, Answer electronic enquiries, Order office supplies and maintain inventory, Type and proofread correspondence, forms and other documents, Maintain and manage digital database, Conduct performance reviews
Personal suitability: Ability to multitask, Organized
Experience: 1 year to less than 2 years
Employment terms options: Flexible hours
How to apply:
By email: slinklogistics@hotmail.com

</details>

---

## 18. cook

```
label: high
reason:  everything checks out but email has immigration in it meaning this job posting is prioritizing immigration rather than a real job posting by the restaurant/business.
```

- **Employer:** Thai Green Elephant Restaurant
- **Location:** Esquimalt, BC   **Pay:** $21.25 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Real family-run Thai restaurant at 809 Craigflower Rd, Esquimalt, operating since 2014 with official site, Tripadvisor (4.4/102 reviews), HappyCow and Esquimalt business directory listings. Cook role fits. Application email cti.immigration@gmail.com is an immigration-consultant-style address rather than the restaurant's, a mild LMIA-recruitment flag worth noting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49954786

<details><summary>Posting text</summary>

Occupation (NOC): Cooks (63200)
Location: Esquimalt, BC
Salary: $21.25 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Restaurant, Willing to relocate, Relocation costs covered by employer
Tasks: Determine the size of food portions and costs, Plan menus and estimate food requirements for their realization, Requisition food and kitchen supplies, Prepare and cook complete meals or individual dishes and foods, Supervise kitchen staff and helpers, Maintain inventory and records of food, supplies and equipment, Clean kitchen and work areas, Organize buffets and banquets, Manage kitchen operations
Cuisine specialties: Thai
Security and safety: Bondable, Criminal record check
Transportation/travel information: Public transportation is available
Work conditions and physical capabilities: Attention to detail, Fast-paced environment, Handling heavy loads, Physically demanding, Repetitive tasks, Standing for extended periods
Personal suitability: Client focus, Dependability, Judgement, Organized, Reliability, Team player, Time management
Screening questions: Are you available to start on the date listed in the job posting?, Do you have experience working in this field?, Do you have the required certifications listed in the job posting?
Employment terms options: Evening, Shift
Experience: 2 years to less than 3 years
Employment terms options: Flexible hours, Night, To be determined, Day, Weekend
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees 
Support for youths: Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Offers workshops, counselling services or other resources to help Veterans navigate their transition into the civilian workforce (for example: adapting to different organizational structures)  , Supports Veterans in translating their military skills and experience into the language of the civilian job market  
Support for Indigenous people: Develops and maintains relationships with indigenous communities, indigenous-owned businesses and organizations   , Provides cultural competency training and/or awareness training to all employees to create a welcoming work environment for Indigenous workers 
Support for mature workers: Offers resources to help mature workers plan their retirement (for example: financial planning, access to pension and benefits, lifestyle adjustments, etc.) 
Supports for visible minorities: Applies hiring policies that discourage discrimination against members of visible minorities (for example: anonymizing the hiring process, etc.), Offers mentorship programs that pair members of visible minorities with experienced employees, Provides diversity and cross-cultural training to create a welcoming work environment for members of visible minorities
How to apply:
By email: cti.immigration@gmail.com
By phone: 7784337172

</details>

---

## 19. Registered Pharmacy Technician

```
label: low
reason:  ats provider matches company. save on foods is reputable as well.
```

- **Employer:** Save-On-Foods
- **Location:** Saanich, British Columbia   **Pay:** $50,960 - $65,520 annually
- **Apply:** https://pfg.wd3.myworkdayjobs.com/SaveonfoodsCareers/job/0624-University-Heights-Pharmacy/Registered-Pharmacy-Technician_R-00039190 (workday)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Save-On-Foods (Pattison Food Group) confirmed; official Workday portal pfg.wd3.myworkdayjobs.com hosts this exact Victoria delivery driver role. Legitimate.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms6p3ckm14sqs29twc8a3b28

<details><summary>Posting text</summary>

Occupation (NOC): Pharmacy technicians (32124)
Location: Saanich, British Columbia
Salary: $50,960 - $65,520 annually
Hours: Part-time
How to apply:
Online: https://pfg.wd3.myworkdayjobs.com/SaveonfoodsCareers/job/0624-University-Heights-Pharmacy/Registered-Pharmacy-Technician_R-00039190

</details>

---

## 20. automotive mechanic

```
label: medium
reason:  physical mail but the address goes to mobil 1 lube express. generic email is whats pushing it to medium.
```

- **Employer:** Mobil 1 Lube Express
- **Location:** Campbell River, BC   **Pay:** $38.40 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address business
  - Real oil-change shop: mobil1campbell.ca contact page confirms 1400 Dogwood St #600, Campbell River, exactly the posting's mailing address (Room 600, 1400 Dogwood St), a commercial auto-service location. The shop's own listed email is also a generic gmail, so the outlook.com application address (islandlubricants12@) is consistent with a small shop, though $38.40/hr for an office admin at a lube shop is generous.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49793011

<details><summary>Posting text</summary>

Occupation (NOC): Automotive service technicians, truck and bus mechanics and mechanical repairers (72410)
Location: Campbell River, BC
Salary: $38.40 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Adjust, repair or replace parts and components of truck-trailer systems, Perform scheduled maintenance service, Test and adjust units to specifications, Advise customers on work performed and future repair requirements
Experience: 2 years to less than 3 years
How to apply:
By email: islandlubricants12@outlook.com
By mail: Room 600, 1400 Dogwood Street, Campbell River, British Columbia, V9W 3A6

</details>

---

## 21. Registered Nurse -SPH

```
label:  low
reason:  island health is reputable. everything matches, even the the hospitals job posting site.
```

- **Employer:** Island Health
- **Location:** Victoria, British Columbia   **Pay:** $86,154 - $123,802 annually
- **Apply:** https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/232944 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Island Health / Vancouver Island Health Authority, headquartered in Victoria BC, delivers hospital, community and mental health services island-wide. Careers portal careers.islandhealth.ca; applications via its own HRSmart tenant. No mailing address requested.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms3m2szc7tf311nlznh0dff3

<details><summary>Posting text</summary>

Occupation (NOC): Registered nurses and registered psychiatric nurses (31301)
Location: Victoria, British Columbia
Salary: $86,154 - $123,802 annually
Hours: Full-time
How to apply:
Online: https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/232944

</details>

---

## 22. information technology (IT) specialist

```
label:   medium
reason:  generic email. didnt use their own hr email. hrjobs179 is used by a lot of other job postings.
```

- **Employer:** INNOV8 DIGITAL SOLUTIONS INC.
- **Location:** Victoria, BC   **Pay:** $31.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Innov8 Digital Solutions is a verified office-equipment/IT services firm (founded 1978, 80+ staff, 10 locations) with a Victoria office at 575 Bay St and an active careers section listing IT roles. Its official application email is careers@innov8.ca, which conflicts with the posting's hrjobs179@gmail.com.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49423746

<details><summary>Posting text</summary>

Occupation (NOC): Information systems specialists (21222)
Location: Victoria, BC
Salary: $31.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: College, CEGEP or other non-university certificate or diploma from a program of 1 year to 2 years
Work setting: Office building
Tasks: Confer with clients to identify requirements, Document technical requirements to ensure that products, processes and solutions meet business requirements, Design, develop and implement information systems business solutions, Provide advice on information systems strategy, policy, management and service delivery, Assess physical and technical security risks to data, software and hardware, Develop policies, procedures and contingency plans to minimize the effects of security breaches, Develop and implement policies and procedures throughout the software development life cycle, Conduct reviews to assess quality assurance practices, software products and information systems, Usability testing, Operate automatic or other testing equipment to ensure product quality, Consult with clients after sale to provide ongoing support, Execute and document results of software application tests and information and telecommunication systems tests
Area of work experience: Information technology (IT) service delivery, Quality assurance or control
Screening questions: Are you available for shift or on-call work?, Are you available to start on the date listed in the job posting?, Do you have experience working in this field?, Do you meet the language requirements listed in the job posting for the position (English or French)?
Experience: 1 year to less than 2 years
Employment terms options: Day
How to apply:
By email: hrjobs179@gmail.com

</details>

---

## 23. food service supervisor

```
label:   
reason:  
```

- **Employer:** Tim Hortons
- **Location:** Invermere, BC   **Pay:** $20.15 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49813043

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Invermere, BC
Salary: $20.15 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Food service establishment, Coffee shop, Fast food outlet or concession, Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Ensure that food and service meet quality control standards, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports
Supervision: 5-10 people, Food service counter attendants and food preparers
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Combination of sitting, standing, walking, Standing for extended periods, Bending, crouching, kneeling, Walking, Physically demanding
Personal suitability: Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Team player
Employment terms options: Early morning, Evening
Experience: 1 year to less than 2 years
Employment terms options: Shift, Morning, Night, Day, Weekend
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides visual accessibility accommodations (for example: braille, screen readers, etc.), Provides auditory accessibility accommodations (for example: transcription software, teletypewriters, etc.), Participates in a government or community program or initiative that supports persons with disabilities , Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Participates in a government or community program or initiative that supports Veterans , Offers mentorship, coaching and/or networking opportunities for Veterans, Provides awareness training to employees to create a welcoming work en

</details>

---

## 24. General Clerk/Deli Clerk

```
label:   
reason:  
```

- **Employer:** QUALITY FOODS
- **Location:** Victoria, British Columbia   **Pay:** $38,480 - $49,920 annually
- **Apply:** https://pfg.wd3.myworkdayjobs.com/QFCareers/job/View-Royal---Victoria-BC/General-Clerk-Deli-Clerk_R-00039413 (workday)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Quality Foods is a 14-store Vancouver Island grocery chain owned by Pattison Food Group; recruitment runs through the parent's pfg Workday tenant (QFCareers), matching this posting's apply link.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmr3wm3bn1gtjv84zx6pwo07l

<details><summary>Posting text</summary>

Occupation (NOC): Retail salespersons and visual merchandisers (64100)
Location: Victoria, British Columbia
Salary: $38,480 - $49,920 annually
Hours: Part-time
How to apply:
Online: https://pfg.wd3.myworkdayjobs.com/QFCareers/job/View-Royal---Victoria-BC/General-Clerk-Deli-Clerk_R-00039413

</details>

---

## 25. ICU/HAU Critical Care Nurse

```
label:   
reason:  
```

- **Employer:** Island Health
- **Location:** Victoria, British Columbia   **Pay:** $86,154 - $123,802 annually
- **Apply:** https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/233370 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Island Health / Vancouver Island Health Authority, headquartered in Victoria BC, delivers hospital, community and mental health services island-wide. Careers portal careers.islandhealth.ca; applications via its own HRSmart tenant. No mailing address requested.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms898s514oz03tx2nrzwdugh

<details><summary>Posting text</summary>

Occupation (NOC): Registered nurses and registered psychiatric nurses (31301)
Location: Victoria, British Columbia
Salary: $86,154 - $123,802 annually
Hours: Part-time
How to apply:
Online: https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/233370

</details>

---

## 26. sales supervisor - retail

```
label:   
reason:  
```

- **Employer:** END OF THE ROLL
- **Location:** Nanaimo, BC   **Pay:** $25.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`
- **Employer web check:** business match, location match, jobs page unknown, mailing address business
  - End Of The Roll is a national Canadian flooring retail chain; the Nanaimo store at 6535 Metral Dr (endoftheroll.com/location/nanaimo) exactly matches the posting's mail/in-person application address, so the mailing address is the retail store itself. Retail sales manager role fits a flooring store. No red flags.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50047539

<details><summary>Posting text</summary>

Occupation (NOC): Retail sales supervisors (62010)
Location: Nanaimo, BC
Salary: $25.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Urban area, Retail business
Tasks: Assign sales workers to duties, Order merchandise, Authorize return of merchandise, Establish work schedules, Sell merchandise, Prepare reports on sales volumes, merchandising and personnel matters,  Resolve issues that may arise, including customer requests, complaints and supply shortages, Organize and maintain inventory, Supervise and co-ordinate activities of workers
Supervision: Retail salespersons and sales clerks
Transportation/travel information: Willing to travel, Valid driver's licence, Public transportation is available
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Handling heavy loads, Attention to detail, Combination of sitting, standing, walking, Walking, Standing for extended periods
Own tools/equipment: Computer, Printer, Internet access, Cellular phone
Personal suitability: Accurate, Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Organized, Reliability, Team player, Dependability, Excellent written communication, Initiative, Judgement, Ability to multitask
Employment terms options: Evening
Experience: 1 year to less than 2 years
Employment terms options: Shift, Flexible hours, Morning, Night, On call, Day, Weekend, Overtime available
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition
Support for youths: Offers on-the-job training tailored to youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Provides awareness training to employees to create a welcoming work environment for Veterans 
Support for Indigenous people: Provides cultural competency training and/or awareness training to all employees to create a welcoming work environment for Indigenous workers 
Support for mature workers: Applies hiring policies that discourage age discrimination  , Provides staff with awareness training to create a welcoming work environment for mature workers  , Offers phased retirement options that allow mature workers to gradually reduce their workload (for example: flexible or reduced work hours, part time employment, project-based or seasonal work, etc.) 
Supports for visible minorities: Applies hiring policies that discourage discrimination against members of visible minorities (for example: anonymizing the hiring process, etc.), Provides diversity and cross-cultural training to create a welcoming work environment for members of visible minorities
How to apply:
By email: carmen@araujogroup.com
By mail: 6535 Metral Drive, Nanai

</details>

---

## 27. Nutritional & Eating Disorders Dietitian

```
label:   
reason:  
```

- **Employer:** Island Health
- **Location:** Nanaimo, British Columbia   **Pay:** $67,438 - $84,177 annually
- **Apply:** https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/234932 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Island Health / Vancouver Island Health Authority, headquartered in Victoria BC, delivers hospital, community and mental health services island-wide. Careers portal careers.islandhealth.ca; applications via its own HRSmart tenant. No mailing address requested.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmtjes1l65ee7s1lcr1wmsr73

<details><summary>Posting text</summary>

Occupation (NOC): Dietitians and nutritionists (31121)
Location: Nanaimo, British Columbia
Salary: $67,438 - $84,177 annually
Hours: Part-time
Term: Temporary
How to apply:
Online: https://islandhealth.hua.hrsmart.com/hr/ats/Posting/view/234932

</details>

---

## 28. food service supervisor

```
label:   
reason:  
```

- **Employer:** Wendy's
- **Location:** Kamloops, BC   **Pay:** $20.15 hourly
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Wendy's operates three verified Victoria BC restaurants; General Manager posting via HigherMe, the legitimate franchise ATS Wendy's uses, is consistent with normal franchise hiring.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49811842

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Kamloops, BC
Salary: $20.15 hourly
Hours: Full-time
Term: Temporary
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Work setting: Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Ensure that food and service meet quality control standards, Prepare budget and cost estimates, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Supervise and check assembly of trays, Establish work schedules
Supervision: Food service counter attendants and food preparers, Staff in various areas of responsibility
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Combination of sitting, standing, walking, Standing for extended periods, Bending, crouching, kneeling, Walking, Physically demanding
Personal suitability: Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Team player
Employment terms options: Early morning, Evening
Experience: 1 year to less than 2 years
Employment terms options: Morning, Night, Day, Weekend
Support for youths: Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: hr@inlandrestaurants.com

</details>

---

## 29. lather apprentice

```
label:   
reason:  
```

- **Employer:** Wescor Contracting Ltd.
- **Location:** Victoria, BC   **Pay:** $32.40 to $36.00 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Wescor Contracting Ltd. is a real Victoria wall and ceiling contractor at 2813 Quesnel Street with 30+ years of operation and admin@wescor.ca as its published contact. The posting instead directs applicants to a free Outlook address, so the link between this posting and the verified company is unconfirmed.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50095999

<details><summary>Posting text</summary>

Occupation (NOC): Plasterers, drywall installers and finishers and lathers (73102)
Location: Victoria, BC
Salary: $32.40 to $36.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work site environment: At heights, Outdoors
Tasks: Read blueprints, drawings and specifications to determine work requirements , Apply, level and smooth coats of plaster, Clean and prepare surfaces, Cut and install metal corner beads to protect exterior corners, Fabricate and install suspended metal ceiling grids and place in panels to form acoustical and coffered ceilings, Fill joints, nail indentations, holes and cracks with joint compound using trowel and broad knife, Measure, cut, fit and install drywall sheets, Position and secure sheets to metal or wooden studs or joists, Tape over joints using taping machine and embed tape in compound, Attach metal or gypsum lath to studs or furring, Cut openings in lath for heating and ventilation piping, ducts and electrical outlets, Install acoustic tile, hangers for suspended ceilings and metal studs for composition wallboard or lath, Install exterior and interior steel studs, Install metal stud framing and furring for interior drywall or plaster walls and ceilings, using hand and power tools, Prepare wall and ceiling layouts
Experience: 3 years to less than 5 years
Support for youths: Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: wescorcontracting982@gmail.com

</details>

---

## 30. automotive mechanic

```
label:   
reason:  
```

- **Employer:** Brar Motors Ltd.
- **Location:** Abbotsford, BC   **Pay:** $37.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - No official website found, but YellowPages lists Brar Motors Ltd at 104-2353 Peardonville Rd, Abbotsford (auto-oriented industrial area), and BC corporate registry (OrgBook) shows active BRAR MOTORS LTD. (BC1033891). Small local auto repair shop without web presence; mechanic role fits the business.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49697806

<details><summary>Posting text</summary>

Occupation (NOC): Automotive service technicians, truck and bus mechanics and mechanical repairers (72410)
Location: Abbotsford, BC
Salary: $37.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Adjust, repair or replace parts and components of commercial transport truck systems, Discuss work with supervisor, Inspect and test mechanical units to locate faults and malfunctions, Road test motor vehicles , Repair or replace mechanical units or components, Test and adjust repaired systems to manufacturer's specifications, Estimate parts and labour cost to perform vehicle maintenance and repairs , Perform scheduled maintenance service, Test and adjust units to specifications, Advise customers on work performed and future repair requirements, Complete reports to record problems and work performed, Provide customer service
Experience: 1 year to less than 2 years
How to apply:
By email: brarmotorsabby@gmail.com

</details>

---

## 31. carpentry foreman/woman

```
label:   
reason:  
```

- **Employer:** Horizon Drywall Ltd.
- **Location:** Victoria, BC   **Pay:** $41.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - Horizon Drywall Ltd is a genuine Victoria-area drywall and steel stud contractor with a live site and careers page. It publishes 577 Hallsor Dr, Victoria V9C 1K9 as its own address, matching the posting's mail-in address, so the address is the firm's business address of record despite being on a residential street.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49969269

<details><summary>Posting text</summary>

Occupation (NOC): Contractors and supervisors, carpentry trades (72013)
Location: Victoria, BC
Salary: $41.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Prepare production and other reports, Resolve work problems, provide technical advice and recommend measures to improve productivity and product quality, Supervise workers and projects, Co-ordinate and schedule activities, Train or arrange for training, Ensure health and safety regulations are followed, Recommend personnel actions, Establish methods to meet work schedules, Read blueprints and drawings, Requisition materials and supplies
Employment terms options: Early morning
Government programs: Recognized employer
Employment terms options: Evening
Experience: 2 years to less than 3 years
Employment terms options: Morning, Day, Weekend
How to apply:
By email: horizondrywalljobs@gmail.com
By mail: 577 Hallsor Dr, Victoria, British Columbia, V9C 1K9

</details>

---

## 32. Wine Advisor

```
label:   
reason:  
```

- **Employer:** Save-On-Foods
- **Location:** Surrey, British Columbia   **Pay:** $37,960 - $43,680 annually
- **Apply:** https://pfg.wd3.myworkdayjobs.com/SaveonfoodsCareers/job/Cloverdale-Crossing---Cloverdale-BC/Wine-Advisor_R-00040314 (workday)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Save-On-Foods (Pattison Food Group) confirmed; official Workday portal pfg.wd3.myworkdayjobs.com hosts this exact Victoria delivery driver role. Legitimate.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmsgry0av31j9ldv1gzd97cpp

<details><summary>Posting text</summary>

Occupation (NOC): Retail salespersons and visual merchandisers (64100)
Location: Surrey, British Columbia
Salary: $37,960 - $43,680 annually
Hours: Part-time
How to apply:
Online: https://pfg.wd3.myworkdayjobs.com/SaveonfoodsCareers/job/Cloverdale-Crossing---Cloverdale-BC/Wine-Advisor_R-00040314

</details>

---

## 33. Staff Engineer, Cloud Development

```
label:   
reason:  
```

- **Employer:** Semtech
- **Location:** Richmond, British Columbia   **Pay:** $120,000 - $134,000 annually
- **Apply:** https://semtech.wd1.myworkdayjobs.com/SemtechCareers/job/CAN---Richmond-BC/Staff-Engineer--Cloud-Development_REQ3427 (workday)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Semtech (semtech.com), NASDAQ-listed semiconductor/IoT firm; its Sierra Wireless acquisition gives it a Richmond BC engineering site at 13811 Wireless Way. Careers page at semtech.com/careers backed by the Workday tenant in the posting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmqkgncaqgqew980qmxoyuggl

<details><summary>Posting text</summary>

Occupation (NOC): Software engineers and designers (21231)
Location: Richmond, British Columbia
Salary: $120,000 - $134,000 annually
Hours: Full-time
How to apply:
Online: https://semtech.wd1.myworkdayjobs.com/SemtechCareers/job/CAN---Richmond-BC/Staff-Engineer--Cloud-Development_REQ3427

</details>

---

## 34. cook

```
label:   
reason:  
```

- **Employer:** Thanks A Latte Ltd.
- **Location:** Ladysmith, BC   **Pay:** $22.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Thanks A Latte is a real cafe at 10862 Chemainus Rd near Ladysmith (Saltair), rated 5.0 on Tripadvisor, known specifically for Filipino pastries and dishes - matching the posting's 'Filipino cuisine' specialty. No official website found (Facebook page and directory listings only), which is normal for a small cafe. Gmail application address is a minor note only.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50131404

<details><summary>Posting text</summary>

Occupation (NOC): Cooks (63200)
Location: Ladysmith, BC
Salary: $22.00 hourly
Hours: Full-time
Term: Temporary
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Restaurant, Rural area, Café
Tasks: Determine the size of food portions and costs, Plan menus and estimate food requirements for their realization, Requisition food and kitchen supplies, Prepare and cook complete meals or individual dishes and foods, Prepare dishes for customers with food allergies or intolerances, Prepare and cook special meals for patients as instructed by dietitian or chef, Inspect kitchens and food service areas, Supervise kitchen staff and helpers, Maintain inventory and records of food, supplies and equipment, Clean kitchen and work areas, Manage kitchen operations
Cuisine specialties: Filipino cuisine
Personal suitability: Dependability, Flexibility, Initiative, Organized, Team player
Screening questions: Are you available for shift or on-call work?, Are you available to start on the date listed in the job posting?, Do you have experience working in this field?, Do you have the required certifications listed in the job posting?, Do you meet the language requirements listed in the job posting for the position (English or French)?
Experience: 1 year to less than 2 years
Employment terms options: Shift
How to apply:
By email: thanksalatteltd@gmail.com

</details>

---

## 35. bottle sorter

```
label:   
reason:  
```

- **Employer:** Qualicum Bottle and Recycling Centre
- **Location:** Qualicum Beach, BC   **Pay:** $25.75 hourly
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Real Return-It bottle depot at 141 Fourth Ave E, Qualicum Beach (return-it.ca, Yellow Pages), affiliated with Parksville Bottle & Recycling Depot's site. However the application email majorai2025@proton.me is completely unrelated to the business name and uses a privacy-focused domain, and $25.75/hr for a bottle sorter is well above market; possible hijacked employer name. Caution warranted.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50023234

<details><summary>Posting text</summary>

Occupation (NOC): Other labourers in processing, manufacturing and utilities (95109)
Location: Qualicum Beach, BC
Salary: $25.75 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Factory or plant
Tasks: Check and weigh materials and products, Sort, pack, crate and package materials and products, Assist machine operators, assemblers and other workers, Perform other labouring and elemental activities, Clean machines and immediate work areas
Experience: 1 to less than 7 months
Employment terms options: Early morning, Evening, Morning, Night, On call, Day
Support for newcomers and refugees: Does not require Canadian work experience
Support for youths: Offers on-the-job training tailored to youth
How to apply:
By email: majorai2025@proton.me

</details>

---

## 36. food service supervisor

```
label:   
reason:  
```

- **Employer:** Tim Hortons
- **Location:** Comox, BC   **Pay:** $20.15 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50155924

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Comox, BC
Salary: $20.15 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Food service establishment, Coffee shop, Fast food outlet or concession, Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Hire food service staff, Ensure that food and service meet quality control standards, Prepare budget and cost estimates, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Supervise and check assembly of trays, Establish work schedules
Supervision: 11-15 people, Food service counter attendants and food preparers
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Combination of sitting, standing, walking, Standing for extended periods, Bending, crouching, kneeling, Walking, Physically demanding
Personal suitability: Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Team player
Employment terms options: Early morning
Government programs: Recognized employer
Employment terms options: Evening
Experience: 1 year to less than 2 years
Employment terms options: Shift, Morning, Night, Day, Weekend
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides visual accessibility accommodations (for example: braille, screen readers, etc.), Provides auditory accessibility accommodations (for example: transcription software, teletypewriters, etc.), Participates in a government or community program or initiative that supports persons with disabilities , Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Su

</details>

---

## 37. Laboratory Assistant - Part Time Regular (Float), Richmond, BC

```
label:   
reason:  
```

- **Employer:** LifeLabs
- **Location:** Richmond, British Columbia   **Pay:** $65,395 - $70,761 annually
- **Apply:** https://jobs.dayforcehcm.com/en-US/lifelabs/CANDIDATEPORTAL/jobs/19250 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Real national lab employer; posting hosted on LifeLabs' own Dayforce candidate portal with standard BCGEU MLT pay. Legitimate.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmrdgzcy65m4yweoo2out40lm

<details><summary>Posting text</summary>

Occupation (NOC): Medical laboratory assistants and related technical occupations (33101)
Location: Richmond, British Columbia
Salary: $65,395 - $70,761 annually
Hours: Part-time
How to apply:
Online: https://jobs.dayforcehcm.com/en-US/lifelabs/CANDIDATEPORTAL/jobs/19250

</details>

---

## 38. Welder/Fabricator Level 2 - Full Time

```
label:   
reason:  
```

- **Employer:** EagleCraft Boats Inc.
- **Location:** Campbell River, British Columbia   **Pay:** $62,400 - $79,040 annually
- **Apply:** https://jobs.smartrecruiters.com/EagleCraftBoatsInc/744000072786915-welder-fabricator-level-2-full-time (smartrecruiters)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location uncertain, jobs page unknown, mailing address none
  - Presumed legitimate without web search: all postings apply via the company's own matching smartrecruiters tenant.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cml722bpc1jsti33wrgkhb4h8

<details><summary>Posting text</summary>

Occupation (NOC): Structural metal and platework fabricators and fitters (72104)
Location: Campbell River, British Columbia
Salary: $62,400 - $79,040 annually
Hours: Full-time
How to apply:
Online: https://jobs.smartrecruiters.com/EagleCraftBoatsInc/744000072786915-welder-fabricator-level-2-full-time

</details>

---

## 39. food services manager

```
label:   
reason:  
```

- **Employer:** Tim Hortons
- **Location:** Lillooet, BC   **Pay:** $27.69 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49036708

<details><summary>Posting text</summary>

Occupation (NOC): Restaurant and food service managers (60030)
Location: Lillooet, BC
Salary: $27.69 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Monitor revenues to determine labour cost , Monitor staff performance , Plan and organize daily operations, Recruit staff, Set staff work schedules, Supervise staff, Train staff, Determine type of services to be offered and implement operational procedures, Balance cash and complete balance sheets, cash reports and related forms, Conduct performance reviews, Cost products and services, Organize and maintain inventory, Negotiate arrangements with suppliers for food and other supplies, Address customers' complaints or concerns, Provide customer service
Supervision: 16-20 people
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Repetitive tasks, Attention to detail, Combination of sitting, standing, walking, Standing for extended periods
Personal suitability: Accurate, Client focus, Dependability, Efficient interpersonal skills, Excellent oral communication, Excellent written communication, Flexibility, Organized, Reliability, Team player
Employment terms options: Early morning, Evening, Shift
Experience: 3 years to less than 5 years
Employment terms options: Morning, Night, Day, Weekend
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides visual accessibility accommodations (for example: braille, screen readers, etc.), Provides auditory accessibility accommodations (for example: transcription software, teletypewriters, etc.), Participates in a government or community program or initiative that supports persons with disabilities , Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Participates in a government or community program or initiative that supports Veterans , Offers mentorshi

</details>

---

## 40. assistant manager - food services

```
label:   
reason:  
```

- **Employer:** Tim Hortons
- **Location:** Victoria, BC   **Pay:** $27.69 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49620162

<details><summary>Posting text</summary>

Occupation (NOC): Restaurant and food service managers (60030)
Location: Victoria, BC
Salary: $27.69 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: College, CEGEP or other non-university certificate or diploma from a program of 1 year to 2 years,  or equivalent experience
Tasks: Analyze budget to boost and maintain the restaurant's profits, Evaluate daily operations , Monitor revenues to determine labour cost , Monitor staff performance , Plan and organize daily operations, Recruit staff, Set staff work schedules, Supervise staff, Train staff, Balance cash and complete balance sheets, cash reports and related forms, Conduct performance reviews, Cost products and services, Organize and maintain inventory, Ensure health and safety regulations are followed, Address customers' complaints or concerns
Supervision: 16-20 people
Certificates, licences, memberships, and courses : First Aid Certificate, Food Safety Certificate
Computer and technology knowledge: Electronic cash register, MS Access, MS Excel, MS Office, MS Outlook, MS PowerPoint, MS Windows, MS Word, Point of sale system, Spreadsheet
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Repetitive tasks, Physically demanding, Attention to detail, Combination of sitting, standing, walking, Standing for extended periods, Large workload
Personal suitability: Accurate, Client focus, Dependability, Efficient interpersonal skills, Excellent oral communication, Excellent written communication, Flexibility, Organized, Reliability, Team player, Ability to multitask
Screening questions: Are you available for shift or on-call work?
Employment terms options: Early morning, Evening
Experience: 2 years to less than 3 years
Employment terms options: Flexible hours, Morning, Night, On call, Day, Weekend
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: themis310@outlook.com
In person: Room 1, 1099 McKenzie Ave, Victoria, British Columbia, V8P 2L5

</details>

---

## 41. Corporate Nurse – Injection Certified BC

```
label:   
reason:  
```

- **Employer:** London Drugs Limited
- **Location:** Saanich, British Columbia   **Pay:** $93,600 annually
- **Apply:** https://london-drugs-limited-jobs.careerplug.com/jobs/3584607/apps/new (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - London Drugs Limited is a legitimate, established Canadian retail pharmacy chain founded in 1945 with 78+ stores across Western Canada. Official website www.londondrugs.com is active and reachable. Headquarters in Richmond, BC; company operates stores throughout BC including Vancouver area. Careers section exists on website. Posting directs applicants to online application via CareerPlug (no mailing address given). All indicators point to legitimate employer.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmtnp4ep83b9n112g4trbw16w

<details><summary>Posting text</summary>

Occupation (NOC): Licensed practical nurses (32101)
Location: Saanich, British Columbia
Salary: $93,600 annually
How to apply:
Online: https://london-drugs-limited-jobs.careerplug.com/jobs/3584607/apps/new

</details>

---

## 42. barista - Store# 04786, TORQUAY VILLAGE

```
label:   
reason:  
```

- **Employer:** Starbucks Coffee Company
- **Location:** Victoria, British Columbia   **Pay:** $38,168 annually
- **Apply:** https://apply.starbucks.com/careers/job/481077756530-barista-store-04786-torquay-village-4077-shelbourne-st-torquay-village-victoria-british-columbia-canada (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Starbucks Hillside Mall store (1644 Hillside Ave, Victoria BC) confirmed via starbucks.ca store locator and review sites. Application routes to apply.starbucks.com official careers portal. Legitimate national employer hiring a store shift supervisor.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmnwx3f5v9f4e1008kkopjzzl

<details><summary>Posting text</summary>

Occupation (NOC): Food counter attendants, kitchen helpers and related support occupations (65201)
Location: Victoria, British Columbia
Salary: $38,168 annually
Hours: Full-time
How to apply:
Online: https://apply.starbucks.com/careers/job/481077756530-barista-store-04786-torquay-village-4077-shelbourne-st-torquay-village-victoria-british-columbia-canada

</details>

---

## 43. food counter attendant

```
label:   
reason:  
```

- **Employer:** EDO JAPAN COLWOOD BC
- **Location:** Victoria, BC   **Pay:** $18.25 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location mismatch, jobs page yes, mailing address residential
  - Edo Japan is a real national teppanyaki franchise; the Colwood outlet operates at 101-1810 Island Hwy (Engel's Corner), Colwood BC. The posting instead directs applicants to mail resumes to 362 Tideline Lane, a single-family home in Royal Bay listed for sale at ~$1.4M, and to contact a Gmail address rather than a franchise domain.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49146986

<details><summary>Posting text</summary>

Occupation (NOC): Food counter attendants, kitchen helpers and related support occupations (65201)
Location: Victoria, BC
Salary: $18.25 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Tasks: Carrying and replace linen, Clean and sanitize items such as dishwasher mats, carts and waste disposal units, Clear and clean tables, trays and chairs, Load buspans and trays, Operate dishwashers to wash dishes, glassware and flatware, Place dishes in storage area, Replenish condiments and other supplies at tables and serving areas, Sanitize and wash dishes and other items by hand, Scour pots and pans, Keep records of the quantities of food used, Package take-out food, Portion and wrap foods, Prepare, heat and finish simple food items, Serve customers at counters or buffet tables, Stock refrigerators and salad bars, Take customers' orders, Use manual and electrical appliances to clean, peel, slice and trim foodstuffs, Clean and sanitize kitchen including work surfaces, cupboards, storage areas, appliances and equipment, Handle and store cleaning products, Receive, unpack and store supplies in refrigerators, freezers, cupboards and other storage areas, Remove kitchen garbage and trash, Sharpen kitchen knives, Sweep, mop, wash and polish floors, Wash, peel and cut vegetables and fruit, Food safety/handling skills
Experience: 1 to less than 7 months
Employment terms options: Evening, Morning, Day, Weekend, Overtime available
How to apply:
By email: colwood.edojapan@gmail.com

</details>

---

## 44. Rights and Permissions Manager

```
label:   
reason:  
```

- **Employer:** University of British Columbia
- **Location:** Vancouver, British Columbia   **Pay:** $80,970 - $116,417 annually
- **Apply:** https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/UBC-Vancouver-Campus---Vancouver-BC-Canada/Rights-and-Permissions-Manager_JR24699 (workday)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - UBC is a major public university; UBC HR's site directs all external staff applicants to the exact Workday tenant this posting uses (ubc.wd10.myworkdayjobs.com/ubcstaffjobs). Vancouver-campus role with institution-typical salary structure.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmps4xlqjc2o9ud2u4p2ba1yd

<details><summary>Posting text</summary>

Occupation (NOC): Social policy researchers, consultants and program officers (41403)
Location: Vancouver, British Columbia
Salary: $80,970 - $116,417 annually
Hours: Full-time
How to apply:
Online: https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/UBC-Vancouver-Campus---Vancouver-BC-Canada/Rights-and-Permissions-Manager_JR24699

</details>

---

## 45. air duct cleaning technician

```
label:   
reason:  
```

- **Employer:** SUNNY CARPET AND UPHOLSTERY CLEANING
- **Location:** Victoria, BC   **Pay:** $37.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page no, mailing address business
  - Sunny Carpet & Upholstery Cleaning Ltd, 4-626 Esquimalt Rd, Victoria BC V9A 3L4, phone 250-384-7951, established 1992 and BBB accredited since 2005. Air duct and carpet cleaning. The posting's mail address is its own unit in a commercial warehouse complex.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50191129

<details><summary>Posting text</summary>

Occupation (NOC): Specialized cleaners (65311)
Location: Victoria, BC
Salary: $37.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Tasks: Operate cleaning machines, Clean building exterior, tanks, chimneys and industrial equipment, Wash and clean interior and exterior windows and other glass surfaces, Vacuum floors, Provide customer service
Work conditions and physical capabilities: Attention to detail, Bending, crouching, kneeling, Physically demanding
Employment terms options: Evening, Morning
Experience: No experience (will train)
Employment terms options: Day, Weekend
How to apply:
By email: resumessunnycarpets@gmail.com
By mail: #4-626 ESQUIMALT ROAD, VICTORIA, British Columbia, V9A 3L4

</details>

---

## 46. food service supervisor

```
label:   
reason:  
```

- **Employer:** WTC Ventures(Wendy's)
- **Location:** Port Alberni, BC   **Pay:** $20.15 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`
- **Employer web check:** business match, location mismatch, jobs page unknown, mailing address business
  - WTC Ventures is a real, substantive Wendy's franchisee operating 90+ restaurants in Seattle, WA and Vancouver, BC. Website www.wtcventures.com is reachable. However, company HQ is in Nashville, TN (7135 Charlotte Pike), not BC. The mailing address (2401G Millstream Rd, Langford, BC) is a legitimate commercial shopping center (Millstream Village) with a Wendy's location, making it a business address—not residential/PO box. Location mismatch: posting claims Victoria, BC but company HQ is Tennessee.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49564144

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Port Alberni, BC
Salary: $20.15 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Ensure that food and service meet quality control standards, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Establish work schedules
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Combination of sitting, standing, walking, Attention to detail
Personal suitability: Client focus, Flexibility, Team player
Experience: 1 year to less than 2 years
Support for youths: Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: twoods@wtcventures.com
By mail: 3550 Johnston Rd, Port Alberni, British Columbia, V9Y 7W8
In person: 3550 Johnston Rd, Port Alberni, British Columbia, V9Y 7W8

</details>

---

## 47. Administrative Assistant Alpine Locations

```
label:   
reason:  
```

- **Employer:** Whistler Blackcomb
- **Location:** Whistler, British Columbia   **Pay:** $49,067 - $65,416 annually
- **Apply:** https://jobs.vailresortscareers.com/whistler/job/Whistler-Administrative-Assistant-Alpine-Locations-BC/1424392600/ (unknown)
- **Detector flags:** none
- **Employer web check:** not performed
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmtf4s5ehmg749n5nqp9gh9gq

<details><summary>Posting text</summary>

Occupation (NOC): Administrative assistants (13110)
Location: Whistler, British Columbia
Salary: $49,067 - $65,416 annually
Hours: Full-time
How to apply:
Online: https://jobs.vailresortscareers.com/whistler/job/Whistler-Administrative-Assistant-Alpine-Locations-BC/1424392600/

</details>

---

## 48. hotel manager

```
label:   
reason:  
```

- **Employer:** Beaconsfield Bed and Breakfast Inn
- **Location:** Victoria, BC   **Pay:** $39.90 to $42.00 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page no, mailing address none
  - Beaconsfield Inn is a real, established luxury bed & breakfast in Victoria, BC at 998 Humboldt Street. Official website is reachable and confirms location match. No dedicated careers section found on site. Posting provides no mailing address (applicants apply online/email). Real, substantive hospitality business that plausibly hires management roles.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49682621

<details><summary>Posting text</summary>

Occupation (NOC): Accommodation service managers (60031)
Location: Victoria, BC
Salary: $39.90 to $42.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Bachelor's degree,  or equivalent experience
Tasks: Develop and implement policies and procedures for daily operations, Recruit and hire staff, Supervise staff, Conduct performance reviews, Negotiate with suppliers for the provision of materials and supplies, Conduct training sessions, Negotiate with clients for the use of facilities, Perform front desk duties, Prepare budgets and monitor revenues and expenses, Arrange for and oversee maintenance activities, Enforce policies and procedures, Address customers' complaints or concerns, Assist clients/guests with special needs, Develop and implement business plans, Establish work schedules
Computer and technology knowledge: MS Word, MS Excel, MS Office, MS Outlook, MS PowerPoint
Security and safety: Criminal record check
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Attention to detail, Combination of sitting, standing, walking
Personal suitability: Efficient interpersonal skills, Excellent oral communication, Excellent written communication, Team player
Experience: 3 years to less than 5 years
Employment terms options: Overtime required
How to apply:
By email: hr.beaconsfield@gmail.com

</details>

---

## 49. Assistant Food Services Manager

```
label:   
reason:  
```

- **Employer:** Crease Harman LLP
- **Location:** Vancouver, British Columbia   **Pay:** $43,500 - $60,000 annually
- **Apply:** https://www.86network.com/jobs/vancouver/bc/casereccio-foods-ltd-dba-casereccio-foods/assistant-restaurant-manager-stenzg (unknown)
- **Detector flags:** none
- **Employer web check:** not performed
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmtlhj9s82yhxg917rir8c6e2

<details><summary>Posting text</summary>

Occupation (NOC): Restaurant and food service managers (60030)
Location: Vancouver, British Columbia
Salary: $43,500 - $60,000 annually
Hours: Full-time
How to apply:
Online: https://www.86network.com/jobs/vancouver/bc/casereccio-foods-ltd-dba-casereccio-foods/assistant-restaurant-manager-stenzg

</details>

---

## 50. Hospitality Team Member

```
label:   
reason:  
```

- **Employer:** The Mustard Seed Street Church
- **Location:** Victoria, British Columbia   **Pay:** $41,600 - $52,000 annually
- **Apply:** https://mustardseedca.bamboohr.com/careers/147 (bamboohr)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location uncertain, jobs page unknown, mailing address none
  - Presumed legitimate without web search: all postings apply via the company's own matching bamboohr tenant.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmpdemvko2tei2akcszbtp9ki

<details><summary>Posting text</summary>

Occupation (NOC): Social and community service workers (42201)
Location: Victoria, British Columbia
Salary: $41,600 - $52,000 annually
Hours: Full-time
How to apply:
Online: https://mustardseedca.bamboohr.com/careers/147

</details>

---

## 51. personal support worker - home support

```
label:   
reason:  
```

- **Employer:** Mary Joan Fetterly
- **Location:** Vancouver, BC   **Pay:** $25.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business mismatch, location match, jobs page no, mailing address none
  - Mary-Jo Fetterly is a real person in Vancouver, BC, but operates as a yoga teacher, mindfulness coach, and author—not a home support/personal support worker service. Her website (mary-jo.com) and Trinity Yoga site show no home care business. The posting lists no mailing address. This appears to be either a misuse of her name or a fraudulent posting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49388180

<details><summary>Posting text</summary>

Occupation (NOC): Home support workers, caregivers and related occupations (44101)
Location: Vancouver, BC
Salary: $25.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Optional accommodation available at no charge on a live-in basis. Note: This is NOT a condition of employment
Tasks: Administer bedside and personal care, Administer medications, Assist clients with bathing and other aspects of personal hygiene, Assist in regular exercise, e.g., walk, Feed or assist in feeding, Launder clothing and household linens, Mend clothing and linens, Perform light housekeeping and cleaning duties, Provide companionship, Provide personal care, Prepare and serve nutritious meals, Cook
Experience: 1 year to less than 2 years
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides visual accessibility accommodations (for example: braille, screen readers, etc.), Provides auditory accessibility accommodations (for example: transcription software, teletypewriters, etc.), Participates in a government or community program or initiative that supports persons with disabilities , Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Participates in a government or community program or initiative that supports Veterans , Offers mentorship, coaching and/or networking opportunities for Veterans, Provides awareness training to employees to create a welcoming work environment for Veterans , Recruits Veterans and other candidates with military experience through targeted hiring initiatives (for example: job fairs, outreach programs etc.) , Assists with immediate transition needs of Veterans (for example: relocation, housing, etc.)  , Offers workshops, counselling services or other resources to help Veterans navigate their transition into the civilian workforce (for example: adapting to different organizatio

</details>

---

## 52. Lead, Quality Improvement and Patient Safety

```
label:   
reason:  
```

- **Employer:** Fraser Health
- **Location:** Surrey, British Columbia   **Pay:** $96,450 - $138,653 annually
- **Apply:** https://jobs.fraserhealth.ca/jobs/143661 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Fraser Health Authority is BC's largest regional health authority; posting applies through its official jobs.fraserhealth.ca portal, and New Westminster is a documented Fraser Health community.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmsiqbivh5xmxj1qjrtf7mcz4

<details><summary>Posting text</summary>

Occupation (NOC): Industrial and manufacturing engineers (21321)
Location: Surrey, British Columbia
Salary: $96,450 - $138,653 annually
Hours: Full-time
How to apply:
Online: https://jobs.fraserhealth.ca/jobs/143661

</details>

---

## 53. food service supervisor

```
label:   
reason:  
```

- **Employer:** Northern Spice Pizza & Donair INC
- **Location:** Fort Nelson, BC   **Pay:** $18.25 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address business
  - NORTHERN SPICE PIZZA & DONAIR INC. is an active BC corporation (OrgBook BC) and OpenStreetMap maps the restaurant at 4916 50th Avenue North, Fort Nelson, exactly matching the posting's mail/in-person address (unit 12). Mail address is the restaurant premises. No official website found (common for small-town restaurants); personal yahoo email noted but consistent with small owner-operated business.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50074859

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Fort Nelson, BC
Salary: $18.25 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Estimate ingredient and supplies required for meal preparation , Ensure that food and service meet quality control standards, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Establish work schedules
Supervision: 3-4 people
Employment terms options: Early morning, Evening
Experience: 1 year to less than 2 years
Employment terms options: Morning, Day, Weekend
Support for persons with disabilities: Offers mentorship, coaching and/or networking opportunities for persons with disabilities 
Support for newcomers and refugees: Offers mentorship programs that pair newcomers and/or refugees with experienced employees 
Support for youths: Offers mentorship, coaching and/or networking opportunities for youth
Support for Veterans: Offers mentorship, coaching and/or networking opportunities for Veterans
Support for Indigenous people: Offers mentorship, coaching and/or networking opportunities for Indigenous workers 
Support for mature workers: Offers mentorship, coaching and/or networking opportunities for mature workers 
Supports for visible minorities: Offers mentorship programs that pair members of visible minorities with experienced employees
How to apply:
By email: jaswantgill282@yahoo.ca
By mail: 12, 4916, 50 Ave North, Fort Nelson, British Columbia, V0C 1R0
In person: 12, 4916, 50 Ave North, Fort Nelson, British Columbia, V0C 1R0

</details>

---

## 54. retail store supervisor

```
label:   
reason:  
```

- **Employer:** Relative Gravity Limited
- **Location:** Port Alberni, BC   **Pay:** $24.00 to $30.00 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business uncertain, location uncertain, jobs page unknown, mailing address none
  - Relative Gravity Limited is a registered Alberta corporation (reg. 2017, Calgary registered office) with multiple recent Port Alberni retail postings on job aggregators, but no website, no storefront name, and no trace of what retail store it operates. A holding/numbered-style company running a local store is plausible and common, but nothing verifies an actual Port Alberni retail operation. No mailing address or other red flags in posting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50071123

<details><summary>Posting text</summary>

Occupation (NOC): Retail sales supervisors (62010)
Location: Port Alberni, BC
Salary: $24.00 to $30.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Supervise staff (apprentices, stages hands, design team, etc.), Assign sales workers to duties, Hire and train or arrange for training of staff, Authorize payments by cheque, Order merchandise, Authorize return of merchandise, Establish work schedules, Sell merchandise, Prepare reports on sales volumes, merchandising and personnel matters,  Resolve issues that may arise, including customer requests, complaints and supply shortages, Organize and maintain inventory, Supervise and co-ordinate activities of workers, Oversee payroll administration, Conduct performance reviews, Supervise office and volunteer staff
Experience: 1 to less than 7 months
Support for newcomers and refugees: Does not require Canadian work experience
Support for youths: Offers on-the-job training tailored to youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: majorai2025@proton.me

</details>

---

## 55. automotive service manager

```
label:   
reason:  
```

- **Employer:** Service Contact Web Inc.
- **Location:** Virtual job based in Saint-Charles-Borromée, QC   **Pay:** $34.70 hourly
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business uncertain, location uncertain, jobs page unknown, mailing address uncertain
  - Searches in English and French for Service Contact Web Inc. in Saint-Charles-Borromée, Joliette and the wider Lanaudière region returned no website, no business-directory entry and no registry or news mention. The employer is unverified rather than demonstrably fake.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49936566

<details><summary>Posting text</summary>

Occupation (NOC): Retail and wholesale trade managers (60020)
Location: Virtual job based in Saint-Charles-Borromée, QC
Salary: $34.70 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Motor vehicle repair shop, Management
Tasks: Direct and control daily operations , Evaluate daily operations , Plan and organize daily operations, Manage staff and assign duties, Determine merchandise and services to be sold, Determine staffing requirements,  Resolve issues that may arise, including customer requests, complaints and supply shortages, Recruit, hire and supervise staff and/or volunteers, Conduct performance reviews, Supervise office and volunteer staff, Appraise clients' needs or eligibility for specific services, Assess client's needs and resources to recommend the appropriate goods or services, Supervisory Experience, Recommend products or services to customers
Supervision: 5-10 people, Telephone operators
Computer and technology knowledge: Electronic scheduler, Word processing software, Database software, Electronic mail, MS Outlook
Area of work experience: Reports and records
Security and safety: Driver's validity licence check
Transportation/travel information: Willing to travel, Willing to travel regularly, Valid driver's licence
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Attention to detail
Personal suitability: Adaptability, Analytical, Collaborative, Creativity, Efficiency, Energetic, Goal-oriented, Hardworking, Integrity, Outgoing, Positive attitude, Proactive, Quick learner, Time management, Client focus, Efficient interpersonal skills, Excellent oral communication, Excellent written communication, Flexibility, Interpersonal awareness, Judgement, Organized, Team player, Maturity, Patience, Resourcefulness, Ability to multitask
Screening questions: Are you available to start on the date listed in the job posting?, Do you have experience working in this field?, Do you have the equipment you need to work from home (like internet and a workspace)?, Do you have the required certifications listed in the job posting?, Do you meet the language requirements listed in the job posting for the position (English or French)?
Experience: 1 to less than 7 months
Employment terms options: Day
Support for persons with disabilities: Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Does not require Canadian work experience
Support for youths: Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Provides awareness training to employees to create a welcoming work environment for Veterans 
Support for mature workers: Applies hiring policies that discourage age discrimination  
How to apply:
By email: emploi@servicecontactweb.com

</details>

---

## 56. store manager - retail

```
label:   
reason:  
```

- **Employer:** Shoppers Drug Mart #0242
- **Location:** Sidney, BC   **Pay:** $43.30 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Shoppers Drug Mart #242 is a verified real pharmacy at 2337 Beacon Ave, Sidney BC (HealthLinkBC, Medimap, pharmacy registries). Store's official email is asdm242@shoppersdrugmart.ca; posting uses sdm242recruiting@gmail.com, off-domain for a major chain, a mild flag, though SDM stores are franchisee-run and store-level Gmail use occurs. Store manager role fits.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49968551

<details><summary>Posting text</summary>

Occupation (NOC): Retail and wholesale trade managers (60020)
Location: Sidney, BC
Salary: $43.30 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Direct and control daily operations , Evaluate daily operations , Plan and organize daily operations, Manage staff and assign duties, Study market research and trends to determine consumer demand, potential sales volumes and effect of competitors' operations on sales, Determine merchandise and services to be sold, Implement price and credits policies, Develop and implement marketing strategies, Plan budgets and monitor revenues and expenses, Determine staffing requirements,  Resolve issues that may arise, including customer requests, complaints and supply shortages, Recruit, hire and supervise staff and/or volunteers
Experience: 1 to less than 7 months
How to apply:
By email: sdm242recruiting@gmail.com

</details>

---

## 57. restaurant assistant manager

```
label:   
reason:  
```

- **Employer:** McDonald's Restaurants
- **Location:** Victoria, BC   **Pay:** $57,595.20 annually
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - McDonald's Restaurants is a legitimate, major Canadian fast-food chain with official website mcdonalds.com/ca. Headquarters confirmed at 1 McDonald's Place, Toronto, ON M3C 3L4. The Victoria location at 980 Pandora Ave is a real, operating McDonald's restaurant (confirmed on official site, Google Maps, Yelp, TripAdvisor, Uber Eats). The mailing address 980 Pandora Ave is the actual restaurant location—a commercial business property, not residential/PO box. Careers section exists at careers.mcdonalds.ca. All details align legitimately.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50195455

<details><summary>Posting text</summary>

Occupation (NOC): Restaurant and food service managers (60030)
Location: Victoria, BC
Salary: $57,595.20 annually
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: College/CEGEP
Budgetary responsibility: $100,001 - $500,000
Tasks: Balance cash and complete balance sheets, cash reports and related forms, Conduct performance reviews, Cost products and services, Organize and maintain inventory, Ensure health and safety regulations are followed, Negotiate arrangements with suppliers for food and other supplies, Participate in marketing plans and implementation, Address customers' complaints or concerns, Provide customer service, Plan, organize, direct, control and evaluate daily operations
Supervision: More than 20 people
Computer and technology knowledge: Electronic cash register, MS Access, MS Excel, MS Office, MS Windows, MS Word, Point of sale system, Spreadsheet
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Attention to detail, Combination of sitting, standing, walking, Standing for extended periods
Personal suitability: Accurate, Client focus, Dependability, Efficient interpersonal skills, Excellent oral communication, Excellent written communication, Flexibility, Organized, Reliability, Team player
Screening questions: Are you available for shift or on-call work?, Are you available to start on the date listed in the job posting?, Are you currently a student?, Do you have experience working in this field?
Employment terms options: Early morning
Government programs: Recognized employer
Employment terms options: Evening, Shift
Experience: 2 years to less than 3 years
Employment terms options: Flexible hours, Morning, Night, Day, Weekend
Support for persons with disabilities: Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees 
Support for youths: Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Offers mentorship, coaching and/or networking opportunities for Veterans, Provides awareness training to employees to create a welcoming work environment for Veterans , Assists with immediate transition needs of Veterans (for example: relocation, housing, etc.)  , Supports Veterans in translating their military skills and experience into the language of the civilian job market  , Offers flexible onboarding options to allow Veterans to gradually adapt to the civilian workplace (for example: gradually increasing hours and responsibilities, etc.) 
Support for Indigenous people: Offers mentorship, coaching and/or networking opport

</details>

---

## 58. food service supervisor

```
label:   
reason:  
```

- **Employer:** Abbey Road Taphouse & Restaurant
- **Location:** Abbotsford, BC   **Pay:** $37.50 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Real sports bar/restaurant at 1851 Sumas Way, Abbotsford with active site, menu, events. Food service supervisor role fits. Minor flag: application email aarthiring@yahoo.com is a generic Yahoo address rather than the site's info@abbeyroadtaphouse.com, though 'aart' plausibly abbreviates Abbey Road Taphouse. Business itself checks out.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49564881

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Abbotsford, BC
Salary: $37.50 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Hire food service staff, Ensure that food and service meet quality control standards, Prepare budget and cost estimates, Address customers' complaints or concerns, Prepare and submit reports, Establish work schedules
Supervision: 5-10 people
Certificates, licences, memberships, and courses : Food Safety Certificate
Transportation/travel information: Public transportation is available
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Standing for extended periods, Physically demanding, Attention to detail
Employment terms options: Evening, Shift
Experience: 3 years to less than 5 years
Employment terms options: Morning, Night, Day, Weekend
How to apply:
By email: aarthiring@yahoo.com

</details>

---

## 59. Sr. Power Platform Developer

```
label:   
reason:  
```

- **Employer:** Softchoice
- **Location:** Vancouver, British Columbia   **Pay:** $99,750 - $133,000 annually
- **Apply:** https://careers.softchoice.com/job/Toronto-Sr_-Power-Platform-Developer-ON/604849417/ (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Softchoice is a verified IT solutions provider (WWT company) with a Vancouver office; SharePoint consulting is core to its Professional Services group. Application via its own careers domain.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms95ruwg0bdh65jlz2w5xosj

<details><summary>Posting text</summary>

Occupation (NOC): Software developers and programmers (21232)
Location: Vancouver, British Columbia
Salary: $99,750 - $133,000 annually
Hours: Full-time
How to apply:
Online: https://careers.softchoice.com/job/Toronto-Sr_-Power-Platform-Developer-ON/604849417/

</details>

---

## 60. live-in caregiver - seniors

```
label:   
reason:  
```

- **Employer:** Private Household (EA)
- **Location:** Victoria, BC   **Pay:** $24.65 hourly
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business mismatch, location uncertain, jobs page unknown, mailing address none
  - "Private Household (EA)" is not a real employer—it's a generic industry classification (NAICS 814). No official company website exists. The email (evangelosa@novicesjobs.com) routes to Novices Jobs, a job board platform, not the actual employer. Applicants cannot identify or verify the real employer. Major red flag for a live-in caregiver role.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49407379

<details><summary>Posting text</summary>

Occupation (NOC): Home support workers, caregivers and related occupations (44101)
Location: Victoria, BC
Salary: $24.65 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Room and board provided, Staff accommodation provided, Work in employer's/client's home
Tasks: Administer bedside and personal care, Assist clients with bathing and other aspects of personal hygiene, Assist in regular exercise, e.g., walk, Launder clothing and household linens, Perform light housekeeping and cleaning duties, Provide companionship, Provide personal care, Prepare and serve nutritious meals
Experience: Experience an asset
How to apply:
By email: evangelosa@novicesjobs.com

</details>

---

## 61. ironworkers foreman/woman

```
label:   
reason:  
```

- **Employer:** LMS Reinforcing Steel Group
- **Location:** Victoria, BC   **Pay:** $39.00 to $42.00 hourly (to be negotiated)
- **Apply:** https://www.lmsgroup.ca/careers (unknown)
- **Detector flags:** `mail_physical_resume`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - LMS Reinforcing Steel Group is a long-established BC rebar fabricator/installer HQ'd at 7452 132 St, Surrey (the posting's mail address), hiring for a Victoria job site. Company-domain email and active career listings make this clearly legitimate.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49628111

<details><summary>Posting text</summary>

Occupation (NOC): Contractors and supervisors, machining, metal forming, shaping and erecting trades and related occupations (72010)
Location: Victoria, BC
Salary: $39.00 to $42.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work site environment: Outdoors
Tasks: Train or arrange for training, Co-ordinate and schedule activities, Ensure health and safety regulations are followed, Requisition or order materials, equipment and supplies, Supervise workers and projects
Experience: 3 years to less than 5 years
How to apply:
Online: https://www.lmsgroup.ca/careers
By mail: 764 Roderick Street, Victoria, British Columbia, V8X 2R3

</details>

---

## 62. Project Manager, Enterprise Systems

```
label:   
reason:  
```

- **Employer:** Global Relay
- **Location:** Vancouver, British Columbia   **Pay:** $95,000 - $120,000 annually
- **Apply:** https://www.globalrelay.com/careers/jobs?gh_jid=5969058004 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location mismatch, jobs page yes, mailing address none
  - Global Relay is a legitimate, established technology company founded in 1999, providing cloud-based compliance and archiving solutions. Official website is reachable and active. Company headquarters is in Vancouver, BC (220 Cambie St), not Merritt. Has active careers page with job listings. Posting directs to online application (no mailing address given). Location mismatch is significant: Merritt is ~350km from Vancouver headquarters, and no evidence of Merritt office found.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmnz044m165778pachth4wqh6

<details><summary>Posting text</summary>

Occupation (NOC): Information systems specialists (21222)
Location: Vancouver, British Columbia
Salary: $95,000 - $120,000 annually
Hours: Full-time
How to apply:
Online: https://www.globalrelay.com/careers/jobs?gh_jid=5969058004

</details>

---

## 63. restaurant manager

```
label:   
reason:  
```

- **Employer:** WTC Ventures(Wendy's)
- **Location:** Courtenay, BC   **Pay:** $27.69 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`
- **Employer web check:** business match, location mismatch, jobs page unknown, mailing address business
  - WTC Ventures is a real, substantive Wendy's franchisee operating 90+ restaurants in Seattle, WA and Vancouver, BC. Website www.wtcventures.com is reachable. However, company HQ is in Nashville, TN (7135 Charlotte Pike), not BC. The mailing address (2401G Millstream Rd, Langford, BC) is a legitimate commercial shopping center (Millstream Village) with a Wendy's location, making it a business address—not residential/PO box. Location mismatch: posting claims Victoria, BC but company HQ is Tennessee.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50120960

<details><summary>Posting text</summary>

Occupation (NOC): Restaurant and food service managers (60030)
Location: Courtenay, BC
Salary: $27.69 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Evaluate daily operations , Modify food preparation methods and menu prices according to the restaurant budget , Monitor revenues to determine labour cost , Monitor staff performance , Plan and organize daily operations, Set staff work schedules, Supervise staff, Determine type of services to be offered and implement operational procedures, Conduct performance reviews, Organize and maintain inventory, Ensure health and safety regulations are followed, Negotiate arrangements with suppliers for food and other supplies, Participate in marketing plans and implementation, Address customers' complaints or concerns, Provide customer service, Plan, organize, direct, control and evaluate daily operations
Type of industry experience: Food and beverages
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Attention to detail
Personal suitability: Accurate, Excellent oral communication, Team player
Experience: 2 years to less than 3 years
Support for youths: Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By mail: 2351 Cliffe Ave, Courtenay, British Columbia, V9N 2L5
In person: 2351 Cliffe Ave, Courtenay, British Columbia, V9N 2L5

</details>

---

## 64. Experienced Lighter

```
label:   
reason:  
```

- **Employer:** Sony Pictures Imageworks
- **Location:** Vancouver, British Columbia   **Pay:** $94,307 - $135,408 annually
- **Apply:** https://job-boards.greenhouse.io/sonypicturesimageworks/jobs/4363740003 (greenhouse)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Sony Pictures Imageworks is a major VFX studio with confirmed Vancouver HQ at 658 Homer St. Application via Greenhouse ATS. Role is highly specific and appropriate. No fraud signals.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmlg7i9al44jk14h3sri9agz2

<details><summary>Posting text</summary>

Occupation (NOC): Producers, directors, choreographers and related occupations (51120)
Location: Vancouver, British Columbia
Salary: $94,307 - $135,408 annually
Hours: Full-time
How to apply:
Online: https://job-boards.greenhouse.io/sonypicturesimageworks/jobs/4363740003

</details>

---

## 65. bookkeeper

```
label:   
reason:  
```

- **Employer:** Kiyara enterprises
- **Location:** Surrey, Victoria, BC   **Pay:** $37.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address virtual
  - Kiyara Enterprises (1236774 BC LTD) is a real company with an official website offering app development, digital marketing, bookkeeping, and tax services. Official address: 7404 King George Blvd #200, Surrey, BC V3W 1N6 matches the posting location. However, this address is a Regus virtual office/serviced office space (King's Cross Shopping Centre), not a dedicated company office. The posting provides only an email (1236774bcltd@gmail.com) for applications—no mailing address. This is a red flag: a professional bookkeeper role using only email contact and a virtual office address suggests potential legitimacy concerns.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49407658

<details><summary>Posting text</summary>

Occupation (NOC): Accounting technicians and bookkeepers (12200)
Location: Surrey, Victoria, BC
Salary: $37.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Calculate and prepare cheques for payroll, Calculate fixed assets and depreciation, Keep financial records and establish, maintain and balance various accounts using manual and computerized bookkeeping systems, Maintain general ledgers and financial statements, Post journal entries, Prepare other statistical, financial and accounting reports, Prepare tax returns, Prepare trial balance of books, Reconcile accounts
Experience: 1 year to less than 2 years
Employment terms options: Morning, Day
How to apply:
By email: 1236774bcltd@gmail.com

</details>

---

## 66. food service supervisor

```
label:   
reason:  
```

- **Employer:** GRIMACE &CO RESTAURANT LTD
- **Location:** Port Hardy, BC   **Pay:** $20.15 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - Grimace & Co Restaurant Ltd is a McDonald's franchise at Campbell River Esso (2001 16th Ave). Address matches posting. No independent website; uses mcdonalds.ca. Company posts jobs on Indeed. Address is a legitimate commercial location (gas station with McDonald's). Moderate confidence due to generic company name and lack of independent web presence, but appears to be a real operating franchise.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49965566

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Port Hardy, BC
Salary: $20.15 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Work site environment: Noisy, Wet/damp, Hot
Work setting: Restaurant
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Ensure that food and service meet quality control standards, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Supervise and check assembly of trays, Supervise and check delivery of food trolleys, Establish work schedules
Supervision: 11-15 people, Food service counter attendants and food preparers
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Tight deadlines, Combination of sitting, standing, walking, Standing for extended periods, Walking, Physically demanding
Personal suitability: Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Team player
Employment terms options: Early morning
Government programs: Recognized employer
Employment terms options: Evening
Experience: 1 year to less than 2 years
Employment terms options: Shift, Flexible hours, Morning, Night, Day, Weekend, Overtime available
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition
Support for youths: Offers on-the-job training tailored to youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Provides awareness training to employees to create a welcoming work environment for Veterans 
Support for Indigenous people: Provides cultural competency training and/or awareness training to all employees to create a welcoming work environment for Indigenous workers 
Support for mature workers: Applies hiring policies that discourage age discrimination  , Provides staff with awareness training to create a welcoming work environment for mature workers  , Offers phased retirement options that allow mature workers to gradually reduce their workload (for example: flexible or reduced work hours, part time employment, project-based or seasonal work, etc.) 
Supports for visible minorities: Applies hiring policies that discourage discrimination against members of visible minorities (for example: anonymizing the hiring process, etc.), Provides diversity and cross-cultural training to create a welcoming work environment for members of visible minorities
How to apply:
By mail: 9025 Granville Street, Port Hardy, British Columbia, V0N 2P0
In p

</details>

---

## 67. Site Reliability Engineer III

```
label:   
reason:  
```

- **Employer:** Electronic Arts
- **Location:** Vancouver, British Columbia   **Pay:** $122,300 - $170,700 annually
- **Apply:** https://jobs.ea.com/en_US/careers/JobDetail/Site-Reliability-Engineer-III/215708 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Electronic Arts is a global video game publisher with a major Vancouver-area studio producing EA SPORTS FC. The posting applies through EA's own jobs.ea.com careers portal. Role, franchise, location and salary band are all internally consistent.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cms5dxtid08semrpo3xu69jke

<details><summary>Posting text</summary>

Occupation (NOC): Software engineers and designers (21231)
Location: Vancouver, British Columbia
Salary: $122,300 - $170,700 annually
How to apply:
Online: https://jobs.ea.com/en_US/careers/JobDetail/Site-Reliability-Engineer-III/215708

</details>

---

## 68. Barista/ Food Service Employee

```
label:   
reason:  
```

- **Employer:** Dexterra
- **Location:** Burnaby, British Columbia   **Pay:** $40,560 - $44,720 annually
- **Apply:** https://jobs.smartrecruiters.com/Dexterra/744000141589020-barista-food-service-employee (smartrecruiters)
- **Detector flags:** `ats_known_provider`
- **Employer web check:** business match, location uncertain, jobs page unknown, mailing address none
  - Presumed legitimate without web search: all postings apply via the company's own matching smartrecruiters tenant.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmsfci4rw5n0dik27wvbj9ouf

<details><summary>Posting text</summary>

Occupation (NOC): Food counter attendants, kitchen helpers and related support occupations (65201)
Location: Burnaby, British Columbia
Salary: $40,560 - $44,720 annually
Hours: Full-time
How to apply:
Online: https://jobs.smartrecruiters.com/Dexterra/744000141589020-barista-food-service-employee

</details>

---

## 69. Silviculture Coordinator

```
label:   
reason:  
```

- **Employer:** West Fraser
- **Location:** Williams Lake, British Columbia   **Pay:** $72,000 - $110,000 annually
- **Apply:** https://recruiting.ultipro.ca/WES5001WFML/JobBoard/0a498053-7ed9-e62f-75be-4ea1cdd9e382/OpportunityDetail?opportunityId=92e88879-d0e6-4717-9db0-1408b3ad4b23 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - West Fraser is a major publicly listed forest products producer with BC roots and mills near Williams Lake. Hiring runs through its UKG/UltiPro Canada tenant (WES5001WFML), matching the posting's apply link. A lumber shipper role at that location is routine for the company.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmp4fvqlw5eylpsws3kgum96x

<details><summary>Posting text</summary>

Occupation (NOC): Forestry professionals (21111)
Location: Williams Lake, British Columbia
Salary: $72,000 - $110,000 annually
Hours: Full-time
How to apply:
Online: https://recruiting.ultipro.ca/WES5001WFML/JobBoard/0a498053-7ed9-e62f-75be-4ea1cdd9e382/OpportunityDetail?opportunityId=92e88879-d0e6-4717-9db0-1408b3ad4b23

</details>

---

## 70. food service supervisor

```
label:   
reason:  
```

- **Employer:** A &W Lickman Road
- **Location:** Chilliwack, BC   **Pay:** $21.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address business
  - A&W is a legitimate, well-established fast-food chain with 750+ restaurants across Canada. The Chilliwack location at 7630 Lickman Road is confirmed to exist and operates as a real A&W restaurant. The mailing address matches the restaurant's actual location (a commercial property co-located with a Chevron gas station). A&W Canada has an official careers portal at workwithus.aw.ca. All details align with a genuine employer.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49524085

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Chilliwack, BC
Salary: $21.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Work setting: Fast food outlet or concession
Tasks: Requisition food and kitchen supplies, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Hire food service staff, Ensure that food and service meet quality control standards, Prepare budget and cost estimates, Maintain records of stock, repairs, sales and wastage, Establish work schedules
Personal suitability: Client focus, Efficient interpersonal skills, Excellent oral communication, Flexibility, Team player
Experience: 1 year to less than 2 years
Support for persons with disabilities: Provides physical accessibility accommodations (for example: ramps, elevators, etc.), Provides visual accessibility accommodations (for example: braille, screen readers, etc.), Provides auditory accessibility accommodations (for example: transcription software, teletypewriters, etc.), Participates in a government or community program or initiative that supports persons with disabilities , Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities, Applies accessible and inclusive recruitment policies that accommodate persons with disabilities 
Support for newcomers and refugees: Participates in a government or community program or initiative that supports newcomers and/or refugees, Assists with immediate settlement needs of newcomers and/or refugees (for example: housing, transportation, storage, childcare, winter clothing, etc.), Supports social and labour market integration of newcomers and/or refugees (for example: facilitating access to community resources, language training, skills training, etc.), Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Supports newcomers and/or refugees with foreign credential recognition, Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees 
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Participates in a government or community program or initiative that supports Veterans , Offers mentorship, coaching and/or networking opportunities for Veterans, Provides awareness training to employees to create a welcoming work environment for Veterans , Recruits Veterans and other candidates with military experience through targeted hiring initiatives (for example: job fairs, outreach programs etc.) , Assists with immediate transition needs of Veterans (for example: relocation, housing, etc.)  , Offers workshops, counselling services or other resources to help Veterans navigate their transition into the civilian workforce (for example: adapting to diffe

</details>

---

## 71. Sales Clerk - Front Shop

```
label:   
reason:  
```

- **Employer:** Rexall Pharmacy Group LTD
- **Location:** Nanaimo, British Columbia   **Pay:** $38,168 - $40,040 annually
- **Apply:** https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=1667272e-54ba-4295-bcf2-c823d2441ce1&jobId=601616&ccId=19000101_000002 (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Rexall is a national pharmacy chain with a dedicated careers site listing pharmacist roles in Victoria, BC. Posting routes to ADP Workforce Now, consistent with Rexall's hiring process. Strongly legitimate.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmsgu9szx1q3qqdvwpvgirq0c

<details><summary>Posting text</summary>

Occupation (NOC): Retail salespersons and visual merchandisers (64100)
Location: Nanaimo, British Columbia
Salary: $38,168 - $40,040 annually
How to apply:
Online: https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=1667272e-54ba-4295-bcf2-c823d2441ce1&jobId=601616&ccId=19000101_000002

</details>

---

## 72. administrative officer

```
label:   
reason:  
```

- **Employer:** Star Box Express
- **Location:** Richmond, BC   **Pay:** $37.00 to $37.50 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Star Box Express Inc is a real cargo/freight company based in Richmond, BC. Official website starboxexpresscargo.com is reachable. Company operates balikbayan (remittance) box services. Multiple sources confirm office at UNIT 2125 21331 GORDON WAY, Richmond, BC V6W1J9, matching claimed location. No mailing address provided in posting (application type: none). No careers section found on website, but company is substantive and legitimate.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50057846

<details><summary>Posting text</summary>

Occupation (NOC): Administrative officers (13100)
Location: Richmond, BC
Salary: $37.00 to $37.50 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate
Tasks: Implement new administrative procedures , Establish work priorities and ensure procedures are followed and deadlines are met, Carry out administrative activities of establishment, Co-ordinate and plan for office services such as accommodation, relocation, equipment, supplies, forms, disposal of assets, parking, maintenance and security services, Assist in the preparation of operating budget and maintain inventory and budgetary controls, Assemble data and prepare periodic and special reports, manuals and correspondence, Perform data entry, Oversee and co-ordinate office administrative procedures, Resolve conflict situations, Oversee payroll administration
Experience: 3 years to less than 5 years
How to apply:
By email: starbox_hiring@outlook.com

</details>

---

## 73. food service supervisor

```
label:   
reason:  
```

- **Employer:** Donair Bite
- **Location:** Delta, BC   **Pay:** $37.00 hourly
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location match, jobs page no, mailing address none
  - Real donair restaurant at Unit 101-1090 Cliveden Ave, Annacis Island, Delta BC with a full website (menu/about/contact). The posting's application email Donairbite01@gmail.com is the same address published on the restaurant's own site, so the generic-domain flag is benign. Food service supervisor role fits; $37/hr is high for the role (possible LMIA-driven posting) but the company is genuine.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/50124835

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Delta, BC
Salary: $37.00 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Work setting: Food service establishment, Restaurant
Tasks: Establish methods to meet work schedules, Requisition food and kitchen supplies, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Hire food service staff, Ensure that food and service meet quality control standards, Prepare budget and cost estimates, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Supervise and check assembly of trays, Supervise and check delivery of food trolleys, Establish work schedules
Supervision: 3-4 people
Work conditions and physical capabilities: Standing for extended periods, Walking
Personal suitability: Efficient interpersonal skills, Excellent oral communication, Initiative
Experience: 1 year to less than 2 years
Employment terms options: Morning, Day, Weekend
How to apply:
By email: donairbite01@gmail.com

</details>

---

## 74. aide, health care

```
label:   
reason:  
```

- **Employer:** Saint Francis Manor by the Sea
- **Location:** Victoria, BC   **Pay:** $28.00 hourly
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page unknown, mailing address none
  - Family-owned independent supportive living residence for seniors at 1128 Dallas Rd, Victoria BC, operating 15+ years with 13 suites. Verified via own website, Yelp, BBB-style directories and senior-living aggregators. Location matches the posting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49915082

<details><summary>Posting text</summary>

Occupation (NOC): Nurse aides, orderlies and patient service associates (33102)
Location: Victoria, BC
Salary: $28.00 hourly
Hours: Full-time
Term: Temporary
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Tasks: Supply and empty bed pans, Take patients' blood pressure, temperature and pulse, Serve meal trays and feed patients, Make beds and maintain patients' rooms, Supervise patients' exercise routines, Maintain inventory of supplies, Bathe, dress and groom patients, Answer call signals to determine patients' needs, Administer first aid in emergency situations
Certificates, licences, memberships, and courses : First Aid Certificate, CPR Certificate
Security and safety: Criminal record check
Work conditions and physical capabilities: Fast-paced environment, Work under pressure, Repetitive tasks, Manual dexterity, Attention to detail, Ability to distinguish between colours, Sound discrimination, Standing for extended periods, Combination of sitting, standing, walking, Bending, crouching, kneeling, Walking
Weight handling: Up to 9 kg (20 lbs)
Personal suitability: Client focus, Dependability, Efficient interpersonal skills, Excellent oral communication, Flexibility, Initiative, Interpersonal awareness, Judgement, Organized, Reliability, Team player
Experience: 3 years to less than 5 years
Employment terms options: To be determined
Support for newcomers and refugees: Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth
Support for Indigenous people: Participates in a government or community program or initiative that supports Indigenous people
Support for mature workers: Applies hiring policies that discourage age discrimination  
Supports for visible minorities: Applies hiring policies that discourage discrimination against members of visible minorities (for example: anonymizing the hiring process, etc.)
How to apply:
By email: sully13@shaw.ca

</details>

---

## 75. Scheduler

```
label:   
reason:  
```

- **Employer:** Victoria Cool Aid Society
- **Location:** Victoria, British Columbia   **Pay:** $66,602 - $73,882 annually
- **Apply:** https://coolaid.startdate.ca/#/career/info/public/1324?language=en (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Victoria Cool Aid Society is a Victoria BC charity founded 1968 running housing, shelter and health services including medical and dental care, headquartered at 749 Pandora Ave. Applications go through its own coolaid.startdate.ca careers portal. Role and location are consistent.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmsgu6q8h3lrdldv17ngo221m

<details><summary>Posting text</summary>

Occupation (NOC): Transportation route and crew schedulers (14405)
Location: Victoria, British Columbia
Salary: $66,602 - $73,882 annually
Hours: Part-time
How to apply:
Online: https://coolaid.startdate.ca/#/career/info/public/1324?language=en

</details>

---

## 76. nurse practitioner

```
label:   
reason:  
```

- **Employer:** Foundever Assistance Services Corporation
- **Location:** Virtual job based in Sydney, NS   **Pay:** $60.00 to $90.00 hourly (to be negotiated)
- **Apply:** https://jobs.foundever.com/job/Virtuel-Infirmier%28%C3%A8re%29-praticien%28ne%29-bilingue-en-soins-virtuels-ASG-Tout/1370265800/?utm_source=jobbank (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Foundever Assistance Services Corporation (Assistance Services Group, a Foundever company) delivers healthcare, insurance and legal assistance services in Canada and holds the New Brunswick virtual-care contract effective July 2026. Hires nurse practitioners remotely across provinces through jobs.foundever.com.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49634352

<details><summary>Posting text</summary>

Occupation (NOC): Nurse practitioners (31302)
Location: Virtual job based in Sydney, NS
Salary: $60.00 to $90.00 hourly (to be negotiated)
Hours: Part-time leading to full-time
Term: Temporary
Workplace: [object Object]
Education: Master's degree
Tasks: Coordinate patient care, Evaluate patient care and progress, Implement an interdisciplinary plan of care, Interpret medical test results , Monitor patients and advise physician of any changes in patients' condition, Order medical diagnostic or clinical tests, Plan patient care, Advise patients on health care, Order laboratory tests, X-rays and other diagnostic procedures, Conduct patient interviews, physical assessments and take medical histories, Provide health maintenance education, Provide consultative services regarding issues relevant to nursing profession and nursing practice
Certificates, licences, memberships, and courses : Licensure as a Nurse Practitioner by the province/territory of work
Screening questions: Do you have experience working in this field?, Do you have the equipment you need to work from home (like internet and a workspace)?, Do you have the required certifications listed in the job posting?, Do you meet the language requirements listed in the job posting for the position (English or French)?
Other: Use of artificial intelligence
Experience: 2 years to less than 3 years
Employment terms options: Flexible hours
How to apply:
Online: https://jobs.foundever.com/job/Virtuel-Infirmier%28%C3%A8re%29-praticien%28ne%29-bilingue-en-soins-virtuels-ASG-Tout/1370265800/?utm_source=jobbank

</details>

---

## 77. Project Manager

```
label:   
reason:  
```

- **Employer:** Kinetic
- **Location:** Victoria, British Columbia   **Pay:** $112,711 - $140,899 annually
- **Apply:** https://recruiting.ultipro.ca/KIN5100KINC/JobBoard/a0c01216-4fd3-471e-b88b-7fc5b660019c/OpportunityDetail?opportunityId=de330a12-5329-4852-8ee3-05ba6a4d143f (unknown)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Kinetic Construction is a real, 100% employee-owned BC general contractor (est. 41 yrs, ~250 employees) with a Victoria office at 250-381-6331. Its careers page shows a matching Project Manager opening in Victoria; hiring via UKG/UltiPro ATS.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/cmmnvu6j8021c6yzocullwpwk

<details><summary>Posting text</summary>

Occupation (NOC): Construction managers (70010)
Location: Victoria, British Columbia
Salary: $112,711 - $140,899 annually
Hours: Full-time
How to apply:
Online: https://recruiting.ultipro.ca/KIN5100KINC/JobBoard/a0c01216-4fd3-471e-b88b-7fc5b660019c/OpportunityDetail?opportunityId=de330a12-5329-4852-8ee3-05ba6a4d143f

</details>

---

## 78. graphic design and illustration animator

```
label:   
reason:  
```

- **Employer:** Obo Studios Inc.
- **Location:** Virtual job based in Mississauga, ON   **Pay:** $34.00 to $40.00 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** `generic_email_domain`
- **Employer web check:** business match, location uncertain, jobs page yes, mailing address none
  - Obo Studios Inc. is a real, substantive company specializing in illustrated and animated content for children. Official website (obostudios.com) is reachable and has a careers section with job listings. The posting claims "Virtual job based in Mississauga, ON" but the website does not specify a physical office location—only describing themselves as a "small, hands-on team." No mailing address provided in posting (applications via email). Location match uncertain since company's actual office location is not disclosed on their website.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49493669

<details><summary>Posting text</summary>

Occupation (NOC): Graphic designers and illustrators (52120)
Location: Virtual job based in Mississauga, ON
Salary: $34.00 to $40.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Tasks: Estimate time to complete graphic designs and illustrations, Adapt existing illustrations, Assist in developing storyboards for electronic productions such as multimedia, interactive and digital products and television advertising and productions, Produce 2-D and 3-D animated drawings or computer illustrations, Determine the medium best suited to produce the desired visual effect and the most appropriate vehicle for communication, Prepare sketches, layouts and graphic elements
Computer and technology knowledge: Toon Boom Harmony, Corel Draw, Adobe Illustrator, Mac OS, Figma
Type of production art: Animation, Visual effects
Screening questions: Are you authorized to work in Canada?, Are you available to start on the date listed in the job posting?, Do you have the equipment you need to work from home (like internet and a workspace)?, Do you meet the language requirements listed in the job posting for the position (English or French)?
Experience: Will train
How to apply:
By email: obostudios7@gmail.com

</details>

---

## 79. food service supervisor

```
label:   
reason:  
```

- **Employer:** Ophelia
- **Location:** Vancouver, BC   **Pay:** $20.45 to $24.00 hourly (to be negotiated)
- **Apply:** (no external link)
- **Detector flags:** none
- **Employer web check:** business match, location match, jobs page no, mailing address none
  - Ophelia is a well-known Michelin Guide-listed Mexican restaurant at 165 W 2nd Ave, Vancouver (opheliakitchen.ca, OpenTable 544 reviews). Employer name is generic but matches this real Vancouver restaurant; food service supervisor role fits. No careers page seen on site. No red flags in posting.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49960982

<details><summary>Posting text</summary>

Occupation (NOC): Food service supervisors (62020)
Location: Vancouver, BC
Salary: $20.45 to $24.00 hourly (to be negotiated)
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: Secondary (high) school graduation certificate,  or equivalent experience
Tasks: Establish methods to meet work schedules, Supervise and co-ordinate activities of staff who prepare and portion food, Train staff in job duties, sanitation and safety procedures, Estimate ingredient and supplies required for meal preparation , Hire food service staff, Ensure that food and service meet quality control standards, Address customers' complaints or concerns, Maintain records of stock, repairs, sales and wastage, Prepare and submit reports, Prepare food order summaries for chef, Supervise and check assembly of trays, Establish work schedules
Experience: 1 year to less than 2 years
Support for youths: Provides awareness training to employees to create a welcoming work environment for youth
How to apply:
By email: flyingpigandfish@gmx.ca

</details>

---

## 80. food counter attendant

```
label:   
reason:  
```

- **Employer:** Tim Hortons
- **Location:** Victoria, BC   **Pay:** $18.25 hourly
- **Apply:** (no external link)
- **Detector flags:** `mail_physical_resume`, `generic_email_domain`
- **Employer web check:** business match, location match, jobs page yes, mailing address none
  - Tim Hortons is a national coffee and quick-service chain with a corporate careers site and multiple Victoria franchise locations. The specific franchisee behind this posting could not be identified: the contact is an unbranded Outlook address and the in-person street address is truncated.
- **Source:** https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/49046903

<details><summary>Posting text</summary>

Occupation (NOC): Food counter attendants, kitchen helpers and related support occupations (65201)
Location: Victoria, BC
Salary: $18.25 hourly
Hours: Full-time
Term: Permanent
Workplace: [object Object]
Education: No degree, certificate or diploma
Work setting: Urban area
Tasks: Clean and sanitize items such as dishwasher mats, carts and waste disposal units, Clear and clean tables, trays and chairs, Load buspans and trays, Operate dishwashers to wash dishes, glassware and flatware, Replenish condiments and other supplies at tables and serving areas, Sanitize and wash dishes and other items by hand, Scour pots and pans, Keep records of the quantities of food used, Package take-out food, Portion and wrap foods, Prepare, heat and finish simple food items, Serve customers at counters or buffet tables, Stock refrigerators and salad bars, Take customers' orders, Use manual and electrical appliances to clean, peel, slice and trim foodstuffs, Clean and sanitize kitchen including work surfaces, cupboards, storage areas, appliances and equipment, Handle and store cleaning products, Receive, unpack and store supplies in refrigerators, freezers, cupboards and other storage areas, Remove kitchen garbage and trash, Sweep, mop, wash and polish floors, Wash, peel and cut vegetables and fruit
Equipment and machinery experience: Electronic cash register
Security and safety: Bondable
Transportation/travel information: Public transportation is available
Work conditions and physical capabilities: Fast-paced environment, Physically demanding, Repetitive tasks, Standing for extended periods, Work under pressure
Weight handling: Up to 23 kg (50 lbs)
Personal suitability: Client focus, Efficient interpersonal skills, Reliability, Team player
Employment terms options: Early morning
Government programs: Recognized employer
Employment terms options: Evening, Shift, Morning, Night
Experience: Will train
Employment terms options: Day, Weekend
Support for persons with disabilities: Offers mentorship, coaching and/or networking opportunities for persons with disabilities , Provides awareness training to employees to create a welcoming work environment for persons with disabilities
Support for newcomers and refugees: Recruits newcomers and/or refugees who were displaced by a conflict or a natural disaster (for example: Ukraine, Afghanistan, etc.) , Offers mentorship programs that pair newcomers and/or refugees with experienced employees , Provides diversity and cross-cultural trainings to create a welcoming work environment for newcomers and/or refugees , Does not require Canadian work experience
Support for youths: Participates in a government or community program or initiative that supports youth employment, Offers on-the-job training tailored to youth, Offers mentorship, coaching and/or networking opportunities for youth, Provides awareness training to employees to create a welcoming work environment for youth
Support for Veterans: Supports Veterans in translating their military skills and experience into the language of the civilian job market  , Offers flexible onboarding options to allow Veterans to gradually adapt to the civilian workplace (for example: gradually increasing hours and responsibilities, etc.) 
Support for Indigenous people: Provides cultural competency training and/or awareness training to all employees to create a welcoming work environment for Indigenous workers 
Support for mature workers: Applies hiring policies that discourage age discrimin

</details>

---
