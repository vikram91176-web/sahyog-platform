import { initDb, prisma, closeDb } from "./db.js";
import { hashPassword } from "./security.js";

export const ROLES = ["WORKER", "CUSTOMER", "COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "FEDERATION_ADMIN", "SUPER_ADMIN"];
const passwordHash = hashPassword("Password123!", "development-seed-salt");

export async function seedPrisma(db = prisma) {
  console.log("Seeding base cooperative platform data into PostgreSQL...");

  // 1. Federation & Cooperative
  const federation = await db.federation.upsert({
    where: { id: "fed_north" },
    update: {},
    create: {
      id: "fed_north",
      name: "North India Service Federation",
      region: "North India",
      status: "ACTIVE"
    }
  });

  const cooperative = await db.cooperative.upsert({
    where: { id: "coop_delhi" },
    update: {},
    create: {
      id: "coop_delhi",
      federationId: federation.id,
      name: "Delhi NCR Household Services Cooperative",
      region: "Delhi NCR",
      policyFeePercent: 8,
      status: "ACTIVE"
    }
  });

  // 2. Service Categories
  const categories = [
    { id: "svc_plumbing", name: "Plumbing", baseHourlyRate: 350, complexityMultiplier: 1.2 },
    { id: "svc_electrical", name: "Electrical", baseHourlyRate: 420, complexityMultiplier: 1.3 },
    { id: "svc_carpentry", name: "Carpentry", baseHourlyRate: 320, complexityMultiplier: 1.1 },
    { id: "svc_cleaning", name: "Cleaning", baseHourlyRate: 250, complexityMultiplier: 1.0 }
  ];

  for (const cat of categories) {
    await db.serviceCategory.upsert({
      where: { id: cat.id },
      update: { baseHourlyRate: cat.baseHourlyRate, complexityMultiplier: cat.complexityMultiplier },
      create: cat
    });
  }

  // 3. Skills
  const skills = [
    { id: "skill_plumbing", name: "Leak repair", categoryId: "svc_plumbing" },
    { id: "skill_pipe", name: "Pipe fitting", categoryId: "svc_plumbing" },
    { id: "skill_bath", name: "Bathroom fittings", categoryId: "svc_plumbing" },
    { id: "skill_wiring", name: "Wiring", categoryId: "svc_electrical" },
    { id: "skill_fixture", name: "Fixture repair", categoryId: "svc_electrical" },
    { id: "skill_breaker", name: "Circuit breaker", categoryId: "svc_electrical" },
    { id: "skill_furniture", name: "Furniture repair", categoryId: "svc_carpentry" },
    { id: "skill_door", name: "Door fitting", categoryId: "svc_carpentry" },
    { id: "skill_clean", name: "Deep cleaning", categoryId: "svc_cleaning" },
    { id: "skill_sanitation", name: "Sanitation", categoryId: "svc_cleaning" }
  ];

  for (const s of skills) {
    await db.skill.upsert({
      where: { id: s.id },
      update: { name: s.name, categoryId: s.categoryId },
      create: s
    });
  }

  // 4. Welfare Schemes
  const schemes = [
    {
      id: "welfare_health",
      name: "Cooperative Health & Maternity Security",
      description: "Immediate cashless medical coverage and accident insurance for active verified workers.",
      eligibility: "Cooperative membership and active availability status",
      documents: ["Aadhaar", "Cooperative ID"]
    },
    {
      id: "welfare_equipment",
      name: "Tool & Safety Equipment Micro-Grant",
      description: "Subsidized safety gear, insulated tools, and trade instrumentation replenishment.",
      eligibility: "Completed at least 15 verified platform services",
      documents: ["Equipment quote", "Worker declaration"]
    },
    {
      id: "welfare_hardship",
      name: "Emergency Worker Hardship Fund",
      description: "Rapid relief stipend for medical emergencies, weather disruptions, or family crises.",
      eligibility: "Verified active cooperative member",
      documents: ["Hardship self-attestation", "Local coordinator approval"]
    }
  ];

  for (const sc of schemes) {
    await db.welfareScheme.upsert({
      where: { id: sc.id },
      update: { name: sc.name, description: sc.description, eligibility: sc.eligibility },
      create: sc
    });
  }

  // 5. Training Programs
  const programs = [
    {
      id: "train_domestic_wiring",
      title: "Certified Modern Residential Wiring",
      serviceCategoryId: "svc_electrical",
      skillsCovered: ["Smart MCBs", "Earthing & Surge", "Appliance Loads"],
      durationHours: 16,
      provider: "Sahyog Technical Academy"
    },
    {
      id: "train_drain_inspection",
      title: "Advanced Pipeline Hydro-Testing",
      serviceCategoryId: "svc_plumbing",
      skillsCovered: ["Pressure Testing", "Under-Floor Mapping", "Leak Sensors"],
      durationHours: 12,
      provider: "Cooperative Skills Council"
    },
    {
      id: "train_green_sanitization",
      title: "Hospital-Grade Residential Sanitization",
      serviceCategoryId: "svc_cleaning",
      skillsCovered: ["Chemical Safety", "Deep Steam Wash", "Pathogen Control"],
      durationHours: 8,
      provider: "Public Health Safety Guild"
    }
  ];

  for (const prog of programs) {
    await db.trainingProgram.upsert({
      where: { id: prog.id },
      update: { title: prog.title, durationHours: prog.durationHours },
      create: prog
    });
  }

  // 6. Base Users & Profiles (Optional Seed Accounts for Testing)
  const users = [
    {
      id: "user_worker",
      email: "worker@sahyog.local",
      name: "Rahul Kumar",
      mobile: "+91 98765 43210",
      role: "WORKER",
      cooperativeId: cooperative.id
    },
    {
      id: "user_worker_suresh",
      email: "suresh@sahyog.local",
      name: "Suresh Verma",
      mobile: "+91 98765 43211",
      role: "WORKER",
      cooperativeId: cooperative.id
    },
    {
      id: "user_worker_sunita",
      email: "sunita@sahyog.local",
      name: "Sunita Devi",
      mobile: "+91 98765 43212",
      role: "WORKER",
      cooperativeId: cooperative.id
    },
    {
      id: "user_worker_amit",
      email: "amit@sahyog.local",
      name: "Amit Patel",
      mobile: "+91 98765 43213",
      role: "WORKER",
      cooperativeId: cooperative.id
    },
    {
      id: "user_customer",
      email: "customer@sahyog.local",
      name: "Ananya Sharma",
      mobile: "+91 98111 22334",
      role: "CUSTOMER",
      cooperativeId: cooperative.id
    },
    {
      id: "user_customer_rohit",
      email: "rohit@sahyog.local",
      name: "Rohit Mehra",
      mobile: "+91 98222 33445",
      role: "CUSTOMER",
      cooperativeId: cooperative.id
    },
    {
      id: "user_coop_admin",
      email: "coop@sahyog.local",
      name: "Meera Cooperative Coordinator",
      mobile: "+91 98333 44556",
      role: "COOPERATIVE_EMPLOYEE",
      cooperativeId: cooperative.id
    },
    {
      id: "user_federation_admin",
      email: "federation@sahyog.local",
      name: "Federation Operations Manager",
      mobile: "+91 98444 55667",
      role: "FEDERATION_ADMIN",
      cooperativeId: cooperative.id,
      federationId: federation.id
    },
    {
      id: "user_super_admin",
      email: "admin@sahyog.local",
      name: "Sahyog Platform Administrator",
      mobile: "+91 98555 66778",
      role: "SUPER_ADMIN",
      cooperativeId: cooperative.id,
      federationId: federation.id
    }
  ];

  for (const u of users) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      const created = await db.user.create({
        data: {
          id: u.id,
          email: u.email,
          name: u.name,
          mobile: u.mobile,
          role: u.role,
          passwordHash,
          cooperativeId: u.cooperativeId,
          federationId: u.federationId
        }
      });

      if (u.role === "WORKER") {
        const wp = await db.workerProfile.create({
          data: {
            userId: created.id,
            cooperativeId: cooperative.id,
            workerCode: `SAH-${Math.floor(1000 + Math.random() * 9000)}`,
            location: "Noida Sector 62",
            yearsExperience: 5,
            rating: 4.9,
            completedJobs: 48,
            verificationStatus: "VERIFIED",
            availabilityStatus: "AVAILABLE",
            languages: ["Hindi", "English"]
          }
        });

        // Link default skills
        await db.workerSkill.create({
          data: { workerId: wp.id, skillId: "skill_plumbing" }
        }).catch(() => {});
        await db.workerSkill.create({
          data: { workerId: wp.id, skillId: "skill_wiring" }
        }).catch(() => {});
      } else if (u.role === "CUSTOMER") {
        await db.customerProfile.create({
          data: {
            userId: created.id,
            location: "Noida Sector 62",
            savedAddresses: ["Noida Sector 62, Block B"]
          }
        });
      } else if (["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN"].includes(u.role)) {
        await db.employeeProfile.create({
          data: {
            userId: created.id,
            cooperativeId: cooperative.id,
            employeeCode: `EMP-${Math.floor(100 + Math.random() * 900)}`,
            department: "Cooperative Service Operations",
            designation: "Lead Coordinator"
          }
        });
      }

      await db.userSetting.create({
        data: {
          userId: created.id,
          notifications: { jobs: true, payments: true, safety: true },
          privacy: { showExactLocation: true }
        }
      }).catch(() => {});
    }
  }

  // 7. Seed Fictional Base Job, Payment, and Review
  const seedJob = await db.job.upsert({
    where: { id: "job_seed_1" },
    update: {},
    create: {
      id: "job_seed_1",
      customerId: "user_customer",
      workerId: "user_worker",
      cooperativeId: cooperative.id,
      serviceCategoryId: "svc_plumbing",
      title: "Kitchen Sink & Pipe Leak Repair",
      description: "Kitchen sink pipe leak and drain inspection needed under sink cabinet.",
      requirements: ["Verified cooperative member", "Transparent fair wage guarantee"],
      location: "Noida Sector 62",
      scheduledAt: new Date(Date.now() - 86400000),
      estimatedDurationHours: 2,
      budget: 840,
      fairWageEstimate: 840,
      finalAmount: 840,
      status: "COMPLETED"
    }
  });

  await db.payment.upsert({
    where: { id: "pay_seed_1" },
    update: {},
    create: {
      id: "pay_seed_1",
      jobId: seedJob.id,
      payerId: "user_customer",
      workerId: "user_worker",
      amount: 840,
      status: "COMPLETED",
      provider: "sandbox"
    }
  });

  await db.review.upsert({
    where: { jobId_customerId: { jobId: seedJob.id, customerId: "user_customer" } },
    update: {},
    create: {
      id: "rev_seed_1",
      jobId: seedJob.id,
      customerId: "user_customer",
      workerId: "user_worker",
      rating: 5,
      body: "Rahul was very prompt and fixed the kitchen drain pipe leak perfectly."
    }
  });

  console.log("PostgreSQL base cooperative seed completed successfully.");
}

// If run directly: node src/seed.js
if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  await initDb();
  await seedPrisma();
  await closeDb();
}
