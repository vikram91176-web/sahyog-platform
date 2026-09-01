import { randomId } from "./security.js";

export const roleHome = {
  WORKER: "/worker",
  CUSTOMER: "/customer",
  COOPERATIVE_EMPLOYEE: "/cooperative",
  COOPERATIVE_ADMIN: "/cooperative",
  FEDERATION_ADMIN: "/federation",
  SUPER_ADMIN: "/admin"
};

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function canReadCooperative(user, cooperativeId) {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "CUSTOMER") return true;
  if (["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN"].includes(user.role)) {
    return !user.cooperativeId || user.cooperativeId === cooperativeId;
  }
  return true;
}

export function canReadJob(user, job) {
  if (!job) return false;
  if (["SUPER_ADMIN", "FEDERATION_ADMIN", "COOPERATIVE_ADMIN", "COOPERATIVE_EMPLOYEE"].includes(user.role)) {
    return canReadCooperative(user, job.cooperativeId);
  }
  if (user.role === "CUSTOMER") return job.customerId === user.id;
  if (user.role === "WORKER") {
    return job.workerId === user.id || ["POSTED", "MATCHING"].includes(job.status);
  }
  return false;
}

export async function decorateJob(prisma, job) {
  if (!job) return null;
  const [category, worker, customer, review, payment] = await Promise.all([
    job.serviceCategoryId ? prisma.serviceCategory.findUnique({ where: { id: job.serviceCategoryId } }).catch(() => null) : null,
    job.workerId ? prisma.user.findUnique({ where: { id: job.workerId } }).catch(() => null) : null,
    job.customerId ? prisma.user.findUnique({ where: { id: job.customerId } }).catch(() => null) : null,
    prisma.review.findFirst({ where: { jobId: job.id } }).catch(() => null),
    prisma.payment.findFirst({ where: { jobId: job.id } }).catch(() => null)
  ]);

  return {
    ...job,
    categoryName: category?.name || "General Service",
    workerName: worker?.name || null,
    customerName: customer?.name || null,
    review: review || null,
    payment: payment || null
  };
}

export async function visibleJobs(prisma, user) {
  let where = {};
  if (user.role === "CUSTOMER") {
    where = { customerId: user.id };
  } else if (user.role === "WORKER") {
    where = {
      OR: [
        { workerId: user.id },
        { status: { in: ["POSTED", "MATCHING"] } }
      ]
    };
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { createdAt: "desc" }
  });

  return Promise.all(jobs.map((job) => decorateJob(prisma, job)));
}

export async function visibleWorkers(prisma, user) {
  const profiles = await prisma.workerProfile.findMany({
    include: {
      user: true,
      skills: {
        include: { skill: true }
      }
    },
    orderBy: { rating: "desc" }
  });

  return profiles.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.user.name,
    email: p.user.email,
    mobile: p.user.mobile,
    location: p.location,
    workerCode: p.workerCode,
    verificationStatus: p.verificationStatus,
    availabilityStatus: p.availabilityStatus,
    serviceRadiusKm: p.serviceRadiusKm,
    yearsExperience: p.yearsExperience,
    rating: p.rating,
    completedJobs: p.completedJobs,
    skills: p.skills.map((s) => s.skill.name)
  }));
}

export async function estimateWage(prisma, input) {
  const category = await prisma.serviceCategory.findUnique({ where: { id: input.serviceCategoryId } });
  if (!category) throw statusError(404, "Service category not found");

  const duration = Number(input.estimatedDurationHours || 1);
  const complexity = Number(input.complexity || category.complexityMultiplier || 1);
  const priority = input.isUrgent ? 1.15 : 1.0;
  const rule = await prisma.wageRule.findFirst({ where: { serviceCategoryId: category.id, active: true } }).catch(() => null);

  const hourlyRate = Math.max(category.baseHourlyRate, rule?.minimumHourlyRate || 0);
  const baseWorkerWage = Math.round(hourlyRate * duration);
  const workerEarning = Math.round(baseWorkerWage * complexity * priority);
  const feePercent = rule?.platformFeePercent ?? 8;
  const cooperativeFee = Math.round(workerEarning * (feePercent / 100));

  return {
    serviceCategoryId: category.id,
    categoryName: category.name,
    baseHourlyRate: hourlyRate,
    durationHours: duration,
    complexityMultiplier: complexity,
    priorityMultiplier: priority,
    estimatedFairWage: workerEarning,
    customerRange: [Math.round(workerEarning * 0.9), Math.round(workerEarning * 1.15)],
    workerExpectedEarning: workerEarning,
    cooperativeFeePercent: feePercent,
    cooperativeFee,
    finalEstimate: workerEarning + cooperativeFee,
    assumptions: [
      `Base rate: ₹${hourlyRate}/hr (trade guaranteed floor)`,
      `Duration: ${duration} hour(s)`,
      `Complexity multiplier: ${complexity}x`,
      `Cooperative platform fee: ${feePercent}% (retained for insurance & emergency reserve)`
    ]
  };
}

export async function createJob(prisma, user, input) {
  if (user.role !== "CUSTOMER" && !["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw statusError(403, "Only customers or administrators can create jobs");
  }

  const estimate = await estimateWage(prisma, input);
  const coop = await prisma.cooperative.findFirst();

  const job = await prisma.job.create({
    data: {
      customerId: user.role === "CUSTOMER" ? user.id : (input.customerId || user.id),
      workerId: null,
      cooperativeId: coop?.id || "coop_default",
      serviceCategoryId: input.serviceCategoryId,
      title: input.title,
      description: input.description,
      requirements: input.requirements || ["Verified worker", "Fair wage guarantee"],
      location: input.location,
      scheduledAt: new Date(input.scheduledAt || Date.now()),
      estimatedDurationHours: Number(input.estimatedDurationHours || 1),
      budget: Number(input.budget || estimate.finalEstimate),
      fairWageEstimate: estimate.estimatedFairWage,
      status: "POSTED"
    }
  });

  // Track initial status history
  await prisma.jobStatusHistory.create({
    data: {
      jobId: job.id,
      fromStatus: "DRAFT",
      toStatus: "POSTED",
      changedById: user.id,
      reason: "Initial customer request created"
    }
  }).catch(() => {});

  // Notify cooperative staff
  const staff = await prisma.user.findMany({
    where: { role: { in: ["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN"] } }
  });

  for (const emp of staff) {
    await prisma.notification.create({
      data: {
        userId: emp.id,
        title: "New Job Request Posted",
        body: `Customer ${user.name} posted a new request: "${job.title}" in ${job.location}.`,
        type: "JOB"
      }
    }).catch(() => {});
  }

  return decorateJob(prisma, job);
}

const transitions = {
  DRAFT: ["POSTED", "CANCELLED"],
  POSTED: ["MATCHING", "ASSIGNED", "CANCELLED"],
  MATCHING: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "CANCELLED", "DISPUTED", "POSTED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED", "DISPUTED"],
  IN_PROGRESS: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ["RESOLVED"],
  RESOLVED: []
};

export async function transitionJob(prisma, user, jobId, status, metadata = {}) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw statusError(404, "Job not found");
  if (!canReadJob(user, job)) throw statusError(403, "Access denied to this job");

  if (!transitions[job.status]?.includes(status)) {
    throw statusError(409, `Cannot transition job from ${job.status} to ${status}`);
  }

  const updateData = { status };
  const fromStatus = job.status;

  if (status === "POSTED" && fromStatus === "ASSIGNED") {
    updateData.workerId = null;
    await prisma.notification.create({
      data: {
        userId: job.customerId,
        title: "Service Request Reopened for Matching",
        body: `The allocated professional was unavailable. Your request "${job.title}" has returned to matching.`,
        type: "JOB"
      }
    }).catch(() => {});
  }

  if (status === "ASSIGNED") {
    const workerId = metadata.workerId || job.workerId;
    if (!workerId) throw statusError(400, "Worker ID required for job assignment");
    updateData.workerId = workerId;

    // Notify assigned worker
    await prisma.notification.create({
      data: {
        userId: workerId,
        title: "New Job Opportunity Allocated",
        body: `You have been allocated "${job.title}" at ${job.location} (Budget: ₹${job.budget}). Please review and accept.`,
        type: "JOB"
      }
    }).catch(() => {});

    // Ensure conversation thread exists for this job
    const existingConv = await prisma.conversation.findFirst({ where: { jobId: job.id } });
    if (!existingConv) {
      await prisma.conversation.create({
        data: {
          jobId: job.id,
          participantIds: [job.customerId, workerId],
          unreadBy: []
        }
      }).catch(() => {});
    }
  }

  if (status === "ACCEPTED") {
    const worker = job.workerId ? await prisma.user.findUnique({ where: { id: job.workerId } }) : null;
    await prisma.notification.create({
      data: {
        userId: job.customerId,
        title: "Job Accepted by Professional",
        body: `${worker?.name || "The professional"} has accepted your request: "${job.title}".`,
        type: "JOB"
      }
    }).catch(() => {});
  }

  if (status === "IN_PROGRESS") {
    const worker = job.workerId ? await prisma.user.findUnique({ where: { id: job.workerId } }) : null;
    await prisma.notification.create({
      data: {
        userId: job.customerId,
        title: "Service Underway",
        body: `${worker?.name || "Service professional"} has started work on "${job.title}".`,
        type: "JOB"
      }
    }).catch(() => {});
  }

  if (status === "COMPLETED") {
    updateData.finalAmount = job.budget;
    const worker = job.workerId ? await prisma.user.findUnique({ where: { id: job.workerId } }) : null;
    await prisma.notification.create({
      data: {
        userId: job.customerId,
        title: "Service Completed",
        body: `"${job.title}" has been completed by ${worker?.name || "your professional"}. Please verify, settle payment, and leave a review.`,
        type: "JOB"
      }
    }).catch(() => {});
  }

  if (status === "DISPUTED") {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN"] } }
    });
    for (const emp of staff) {
      await prisma.notification.create({
        data: {
          userId: emp.id,
          title: "Dispute Flagged on Job",
          body: `A dispute has been raised on Job #${job.id} ("${job.title}"). Requires mediation.`,
          type: "DISPUTE"
        }
      }).catch(() => {});
    }
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: updateData
  });

  // Track status history
  await prisma.jobStatusHistory.create({
    data: {
      jobId: job.id,
      fromStatus,
      toStatus: status,
      changedById: user.id,
      reason: metadata.reason || null
    }
  }).catch(() => {});

  return decorateJob(prisma, updated);
}

export async function matchWorkers(prisma, jobId, user) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw statusError(404, "Job not found");
  if (!canReadJob(user, job)) throw statusError(403, "Access denied");

  const [category, profiles] = await Promise.all([
    prisma.serviceCategory.findUnique({ where: { id: job.serviceCategoryId } }),
    prisma.workerProfile.findMany({
      include: {
        user: true,
        skills: {
          include: { skill: true }
        }
      }
    })
  ]);

  const matches = profiles.map((profile) => {
    const categoryMatch = profile.skills.some((ws) => ws.skill.categoryId === job.serviceCategoryId);
    const availability = profile.availabilityStatus === "AVAILABLE";
    const verification = profile.verificationStatus === "VERIFIED";

    const skillPoints = categoryMatch ? 35 : 0;
    const availabilityPoints = availability ? 20 : 0;
    const verificationPoints = verification ? 15 : 0;
    const experiencePoints = Math.min(15, (profile.yearsExperience || 0) * 2);
    const ratingPoints = Math.round((profile.rating || 0) * 3);
    const score = Math.min(100, skillPoints + availabilityPoints + verificationPoints + experiencePoints + ratingPoints);

    const reasons = [
      categoryMatch ? `${category?.name || "Trade"} skills match` : "Trade skills review needed",
      availability ? "Available for scheduling" : "Currently offline / busy",
      `Within ${profile.serviceRadiusKm} km cooperative radius`,
      verification ? "Identity & cooperative credentials verified" : "Verification check pending",
      `${profile.yearsExperience || 1} years verified field experience`
    ];

    return {
      workerId: profile.userId,
      workerName: profile.user.name,
      profileId: profile.id,
      score,
      reasons,
      rating: profile.rating,
      completedJobs: profile.completedJobs,
      location: profile.location
    };
  }).sort((a, b) => b.score - a.score);

  // Store match scores
  await prisma.matchScore.deleteMany({ where: { jobId } }).catch(() => {});
  for (const m of matches.slice(0, 5)) {
    await prisma.matchScore.create({
      data: {
        jobId,
        workerId: m.workerId,
        score: m.score,
        reasons: m.reasons
      }
    }).catch(() => {});
  }

  return matches;
}

export async function createReview(prisma, user, body) {
  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) throw statusError(404, "Job not found");
  if (job.customerId !== user.id) throw statusError(403, "Only the customer who created the job can submit a review");
  if (job.status !== "COMPLETED") throw statusError(400, "Only completed jobs can be reviewed");

  const existing = await prisma.review.findFirst({ where: { jobId: job.id, customerId: user.id } });
  if (existing) throw statusError(409, "A review has already been submitted for this job");

  const rating = Math.max(1, Math.min(5, Number(body.rating || 5)));
  const review = await prisma.review.create({
    data: {
      jobId: job.id,
      customerId: user.id,
      workerId: job.workerId,
      rating,
      body: String(body.body || "").trim()
    }
  });

  // Recalculate worker rating and completed jobs count
  if (job.workerId) {
    const profile = await prisma.workerProfile.findUnique({ where: { userId: job.workerId } });
    if (profile) {
      const allReviews = await prisma.review.findMany({ where: { workerId: job.workerId } });
      const avg = Number((allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(1));

      await prisma.workerProfile.update({
        where: { id: profile.id },
        data: {
          completedJobs: { increment: 1 },
          rating: avg
        }
      });
    }

    // Notify worker
    await prisma.notification.create({
      data: {
        userId: job.workerId,
        title: "New Review & Rating Received",
        body: `${user.name} rated your service ${rating}★: "${review.body.slice(0, 60)}"`,
        type: "REVIEW"
      }
    }).catch(() => {});
  }

  return review;
}

export async function createPayment(prisma, user, body) {
  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) throw statusError(404, "Job not found");
  if (job.customerId !== user.id && !["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw statusError(403, "Only the customer or administrator can settle payment");
  }

  const requestedProvider = String(body.provider || process.env.PAYMENT_PROVIDER || "sandbox").toLowerCase();
  let provider = "sandbox";
  let transactionReference = `SANDBOX_TXN_${randomId("pay")}`;

  if (["razorpay", "stripe"].includes(requestedProvider)) {
    const gatewaySecret = process.env.PAYMENT_PROVIDER_SECRET;
    if (!gatewaySecret || gatewaySecret.trim().length < 5) {
      throw statusError(422, `Payment provider '${requestedProvider}' credentials are not configured on this server. Please set PAYMENT_PROVIDER_SECRET in .env, or use the Sandbox Escrow option.`);
    }
    provider = requestedProvider;
    transactionReference = `${requestedProvider.toUpperCase()}_ORDER_${randomId("gw")}`;
  }

  const amount = Number(body.amount || job.budget);
  const payment = await prisma.payment.create({
    data: {
      jobId: job.id,
      payerId: user.id,
      workerId: job.workerId,
      amount,
      status: "COMPLETED",
      provider
    }
  });

  await prisma.job.update({
    where: { id: job.id },
    data: { finalAmount: amount }
  }).catch(() => {});

  if (job.workerId) {
    await prisma.notification.create({
      data: {
        userId: job.workerId,
        title: "Fair Wage Payment Disbursed",
        body: `Payment of ₹${amount.toLocaleString("en-IN")} for "${job.title}" has been settled via ${provider === "sandbox" ? "sandbox escrow" : provider.toUpperCase()} (Ref: ${transactionReference}).`,
        type: "PAYMENT"
      }
    }).catch(() => {});
  }

  return {
    ...payment,
    transactionReference,
    providerLabel: provider === "sandbox" ? "Sahyog Sandbox Escrow" : provider.toUpperCase()
  };
}

export async function updateWorkerProfile(prisma, user, input) {
  if (user.role !== "WORKER") throw statusError(403, "Only workers can update worker profile");
  const profile = await prisma.workerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw statusError(404, "Worker profile not found");

  const updateData = {};
  if (input.location !== undefined) updateData.location = String(input.location).trim();
  if (input.yearsExperience !== undefined) updateData.yearsExperience = Number(input.yearsExperience);
  if (input.serviceRadiusKm !== undefined) updateData.serviceRadiusKm = Number(input.serviceRadiusKm);
  if (input.availabilityStatus !== undefined) updateData.availabilityStatus = String(input.availabilityStatus);
  if (Array.isArray(input.languages)) updateData.languages = input.languages;

  const updated = await prisma.workerProfile.update({
    where: { id: profile.id },
    data: updateData,
    include: {
      user: true,
      skills: { include: { skill: true } }
    }
  });

  return {
    ...updated,
    name: updated.user.name,
    email: updated.user.email,
    mobile: updated.user.mobile,
    skills: updated.skills.map((s) => s.skill.name)
  };
}

export async function getOrCreateJobConversation(prisma, user, jobId) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw statusError(404, "Job not found");
  if (!canReadJob(user, job)) throw statusError(403, "Access denied to job conversation");

  let conversation = await prisma.conversation.findFirst({ where: { jobId: job.id } });
  if (!conversation && job.workerId) {
    conversation = await prisma.conversation.create({
      data: {
        jobId: job.id,
        participantIds: [job.customerId, job.workerId],
        unreadBy: []
      }
    });
  }

  if (!conversation) return { conversation: null, messages: [] };

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" }
  });

  return { conversation, messages };
}

export async function sendMessage(prisma, user, body) {
  const conversation = await prisma.conversation.findUnique({ where: { id: body.conversationId } });
  if (!conversation) throw statusError(404, "Conversation not found");
  if (!conversation.participantIds.includes(user.id)) throw statusError(403, "Not a participant in this conversation");

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      body: String(body.body || "").trim(),
      status: "SENT"
    }
  });

  // Notify other participant
  const otherId = conversation.participantIds.find((id) => id !== user.id);
  if (otherId) {
    await prisma.notification.create({
      data: {
        userId: otherId,
        title: `Message from ${user.name}`,
        body: message.body.slice(0, 80),
        type: "MESSAGE"
      }
    }).catch(() => {});
  }

  return message;
}

export async function createSosIncident(prisma, user, body) {
  if (user.role !== "WORKER") throw statusError(403, "Only workers can trigger emergency SOS");

  const incident = await prisma.sosIncident.create({
    data: {
      userId: user.id,
      location: String(body.location || "Cooperative Zone (GPS)"),
      note: String(body.note || "Worker triggered emergency safety assistance."),
      status: "OPEN"
    }
  });

  const staff = await prisma.user.findMany({
    where: { role: { in: ["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "SUPER_ADMIN"] } }
  });

  for (const emp of staff) {
    await prisma.notification.create({
      data: {
        userId: emp.id,
        title: "URGENT: Worker Safety SOS Triggered",
        body: `Emergency alert from ${user.name} at ${incident.location}. Note: ${incident.note}`,
        type: "SAFETY"
      }
    }).catch(() => {});
  }

  return incident;
}

export async function resolveSosIncident(prisma, user, incidentId) {
  if (!["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw statusError(403, "Only administrators can resolve safety incidents");
  }

  return prisma.sosIncident.update({
    where: { id: incidentId },
    data: { status: "RESOLVED" }
  });
}

export async function createDispute(prisma, user, body) {
  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) throw statusError(404, "Job not found");
  if (!canReadJob(user, job)) throw statusError(403, "Access denied");

  const dispute = await prisma.dispute.create({
    data: {
      jobId: job.id,
      createdById: user.id,
      reason: String(body.reason || "Dispute raised"),
      status: "OPEN",
      comments: []
    }
  });

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "DISPUTED" }
  }).catch(() => {});

  return dispute;
}

export async function resolveDispute(prisma, user, disputeId, resolution) {
  if (!["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw statusError(403, "Only staff can resolve disputes");
  }

  const dispute = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: "RESOLVED",
      resolution: String(resolution || "Resolved by cooperative mediation.")
    }
  });

  await prisma.job.update({
    where: { id: dispute.jobId },
    data: { status: "RESOLVED" }
  }).catch(() => {});

  return dispute;
}

export async function analyticsSummary(prisma, user) {
  const [
    totalWorkers,
    verifiedWorkers,
    totalCustomers,
    totalJobs,
    activeJobs,
    completedJobs,
    paymentsSum,
    unreadNotifications,
    openDisputes,
    openSos,
    welfareApps,
    trainingEnrolls,
    categories
  ] = await Promise.all([
    prisma.workerProfile.count(),
    prisma.workerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.customerProfile.count(),
    prisma.job.count(),
    prisma.job.count({ where: { status: { in: ["POSTED", "MATCHING", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"] } } }),
    prisma.job.count({ where: { status: "COMPLETED" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "COMPLETED" } }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.sosIncident.count({ where: { status: "OPEN" } }),
    prisma.welfareApplication.count(),
    prisma.trainingEnrollment.count(),
    prisma.serviceCategory.findMany({ include: { _count: { select: { jobs: true } } } })
  ]);

  const serviceDemand = {};
  for (const cat of categories) {
    serviceDemand[cat.name] = cat._count.jobs;
  }

  const jobsByStatus = {};
  const statusCounts = await prisma.job.groupBy({
    by: ["status"],
    _count: { id: true }
  });
  for (const sc of statusCounts) {
    jobsByStatus[sc.status] = sc._count.id;
  }

  return {
    totals: {
      workers: totalWorkers,
      verifiedWorkers,
      customers: totalCustomers,
      jobs: totalJobs,
      activeJobs,
      completedJobs,
      earnings: paymentsSum._sum.amount || 0,
      unreadNotifications,
      disputes: openDisputes,
      sosIncidents: openSos
    },
    jobsByStatus,
    serviceDemand,
    welfareParticipation: welfareApps,
    trainingParticipation: trainingEnrolls
  };
}

export async function generateAiResponse(prisma, user, message) {
  const jobs = await visibleJobs(prisma, user);
  const analytics = await analyticsSummary(prisma, user);
  const apiKey = process.env.OPENAI_API_KEY;
  const configured = Boolean(apiKey && apiKey.trim().length > 10);

  const facts = [
    `role=${user.role}`,
    `name=${user.name}`,
    `visibleJobs=${jobs.length}`,
    `activeJobs=${analytics.totals.activeJobs}`,
    `completedJobs=${analytics.totals.completedJobs}`,
    `unreadAlerts=${analytics.totals.unreadNotifications}`
  ];

  if (user.role === "WORKER") {
    const profile = await prisma.workerProfile.findUnique({ where: { userId: user.id } });
    if (profile) {
      facts.push(`workerRating=${profile.rating}★`, `completedCount=${profile.completedJobs}`, `availability=${profile.availabilityStatus}`);
    }
  }

  let body = "";
  let sourceType = "CONFIGURATION_REQUIRED";

  if (configured) {
    try {
      const systemPrompt = `You are the official SAHYOG Cooperative Assistant, an intelligent, empathetic advisor for a worker-first digital public infrastructure platform in India.
User: ${user.name} (Role: ${user.role})
Authorized Jobs: ${JSON.stringify(jobs.slice(0, 5).map((j) => ({ id: j.id, title: j.title, status: j.status, budget: j.budget, category: j.categoryName, location: j.location })))}
Active Analytics: ${JSON.stringify(analytics.totals)}

Answer the user concisely, helpfully, and with dignified tone. Focus on fair wages, transparent pricing, safety, and cooperative benefits.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          max_tokens: 400,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API status ${response.status}`);
      }

      const completion = await response.json();
      body = completion.choices?.[0]?.message?.content?.trim() || "No response generated";
      sourceType = "OPENAI_LIVE";
    } catch (err) {
      body = `AI Provider Notice: Could not contact OpenAI (${err.message}). Showing authorized platform data: ${localDataSummary(jobs, analytics, message)}`;
      sourceType = "AI_PROVIDER_ERROR";
    }
  } else {
    body = `AI provider is not configured. Set OPENAI_API_KEY in your environment or .env file to enable live AI responses with GPT-4o-mini.\n\nAuthorized platform data:\n${localDataSummary(jobs, analytics, message)}`;
  }

  // Persist conversation in database
  let conv = await prisma.aiConversation.findFirst({ where: { userId: user.id } });
  if (!conv) {
    conv = await prisma.aiConversation.create({ data: { userId: user.id } });
  }

  await prisma.aiMessage.create({
    data: {
      conversationId: conv.id,
      role: "user",
      body: message
    }
  });

  const aiMsg = await prisma.aiMessage.create({
    data: {
      conversationId: conv.id,
      role: "assistant",
      body,
      facts,
      sourceType,
      providerConfigured: configured
    }
  });

  return {
    configured,
    body,
    facts,
    sourceType,
    messageId: aiMsg.id
  };
}

function localDataSummary(jobs, analytics, message) {
  if (/job|work|match/i.test(message)) {
    return jobs.length
      ? `You have ${jobs.length} authorized job records. Active task: "${jobs[0].title}" (Status: ${jobs[0].status}, Budget: ₹${jobs[0].budget}).`
      : "There are currently no active job records matching your profile.";
  }
  if (/wage|earn|payment/i.test(message)) {
    return `Disbursed payments total ₹${analytics.totals.earnings.toLocaleString("en-IN")}. SAHYOG guarantees 100% fair base wage pass-through without predatory commission cuts.`;
  }
  return `Platform status: ${analytics.totals.activeJobs} active jobs, ${analytics.totals.completedJobs} completed jobs, ${analytics.totals.unreadNotifications} unread notifications.`;
}
